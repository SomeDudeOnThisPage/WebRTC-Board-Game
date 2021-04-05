import {rtcICECandidatePairStats, uuid4} from '../utils.js';

export default function Peer() {
  this.id = uuid4();
  this.callbacks = {};
  this.rtcConfiguration = {iceTransportPolicy : 'all'}; // relay testing
  this.connections = {};         // master has N-1 connections, slaves have only one connection to their master
  this.sendSignal = undefined;   // callback to send a signaling message to a remote peer
  this.isMasterPeer = false;     // decided by signaling server on joining a room
}

Peer.prototype.closeConnections = function() {
  Object.values(this.connections).forEach((connection) => {
    connection.close();
    clearInterval(connection.statsInterval);
  });
}

Peer.prototype.closeConnection = function(remotePeerId) {
  if (this.connections[remotePeerId]) {
    this.connections[remotePeerId].close();
    clearInterval(this.connections[remotePeerId].statsInterval);
    delete this.connections[remotePeerId];
  }
}

Peer.prototype.setICETransportPolicy = function(policy) {
  if (policy !== 'relay' && policy !== 'all') {
    console.error('ICE transport policy must be of values [relay, all]');
    return;
  }

  this.rtcConfiguration.iceTransportPolicy = policy;
}

Peer.prototype.setICEServers = function(servers) {
  this.rtcConfiguration.iceServers = servers;
}

Peer.prototype.setSignalingCallback = function(cb) {
  this.sendSignal = cb;
}

Peer.prototype._receiveMessage = function(e) {
  const message = JSON.parse(e.data);

  // if (this.isMasterPeer) {
    // if the message is targeted, emit to target peer - else relay to all other peers
  //   message.target ? this.emit(message.target, e.data) : this.relay(message.src, e.data);
  // }

  if (message.event && this.callbacks[message.event]) {
    this.callbacks[message.event](...message.data, message.src)
  }
}

Peer.prototype._dataChannelOpen = function(remotePeerId) {
  console.log(`[${remotePeerId}] data channel open`);

  // if we are the host peer, check if all channels are open
  if (Object.values(this.connections).every((c) => c.dc && c.dc.readyState === 'open')) {
    // notify client peers (and ourselves, so it is symmetrical whether we are a host or client peer)
    if (this.callbacks['onDataChannelsOpen']) this.callbacks['onDataChannelsOpen']();
  }
}

Peer.prototype._createConnection = function(remotePeerId, isInitiator) {
  const connection = new RTCPeerConnection(this.rtcConfiguration);

  if (isInitiator) {
    // setup a reliable and ordered data channel, store in connection object
    connection.dc = connection.createDataChannel('dc');
    connection.dc.onmessage = (e) => this._receiveMessage(e);
    connection.dc.onopen = () => this._dataChannelOpen(remotePeerId);
  } else {
    // otherwise, we need to receive the data channel and store it in the connection object
    connection.ondatachannel = (e) => {
      if (e.channel) {
        connection.dc = e.channel;
        connection.dc.onmessage = (e) => this._receiveMessage(e);
        connection.dc.onopen = () => this._dataChannelOpen(remotePeerId);
      }
    }
  }

  connection.onsignalingstatechange = () => {
    console.log(`[${remotePeerId}] signaling state '${connection.signalingState}'`);
  }

  connection.onicecandidate = (e) => {
    if (e.candidate) {// e.candidate === null means we finished gathering ice candidates
      this.sendSignal(this._createSignal('ice-candidate', e.candidate, remotePeerId));
    }
  }

  return connection;
}

Peer.prototype._createSignal = function(type, data, target) {
  return {type : type, src : this.id, target : target, data : data}
}

Peer.prototype.connect = function(remotePeerId) {
  const connection = this._createConnection(remotePeerId, true);
  this.connections[remotePeerId] = connection;

  connection.createOffer().then((offer) => {
    connection.setLocalDescription(offer).then(() => {
      this.sendSignal({         // signal the remote peer to inform them of our offer
        type : 'offer',         // tell the remote peer what type of signal this is
        src : this.id,          // tell the remote peer (and signaling server) who this signal is from
        target : remotePeerId,  // tell the remote peer (and signaling server) who this signal is addressed to
        data : connection.localDescription // offer is our local description
      });
    })
  });
}

Peer.prototype.onsignal = function(e) {
  if (e.target && e.target === this.id) {
    switch(e.type) {
      // on offer, create our answer, set our local description and signal the remote peer
      case 'offer':
        const connection = this._createConnection(e.src, this.servers, /* isInitiator */ false);
        this.connections[e.src] = connection;

        connection.setRemoteDescription(e.data).then(() => {
          connection.createAnswer().then((answer) => {
            connection.setLocalDescription(answer).then(() => {
              this.sendSignal(this._createSignal('answer', connection.localDescription, e.src));
            })
          });
        });
        break;
      // on answer, set our remote description
      case 'answer':
        this.connections[e.src].setRemoteDescription(e.data).then();
        break;
      case 'ice-candidate':
        this.connections[e.src].addIceCandidate(e.data).then(() => {
        });
        break;
    }
  }
}

Peer.prototype.on = function(e, cb) {
  this.callbacks[e] = cb;
}

Peer.prototype.emit = function(target, e, ...args) { // function for the master peer to relay a targeted message
  if (this.connections[target]) {
    const data = JSON.stringify({src : this.id, event: e, data: args});
    this.connections[target].dc.send(data);
  }
}

Peer.prototype.relay = function(exclude, packet) { // function for the master peer to relay a message
  Object.keys(this.connections).forEach((key) => {
    if (key !== exclude) {
      this.connections[key].dc.send(packet);
    }
  });
}

Peer.prototype.broadcast = function(e, ...args) { // function for any peer to broadcast a message
  Object.values(this.connections).forEach((connection) => {
    const data = JSON.stringify({src : this.id, event: e, data: args});
    connection.dc.send(data);
  });
}
