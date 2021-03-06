const STYLE_OVERLAY = {
  'position' : 'absolute',
  'width' : '100%',
  'height' : '33.3%',
  'top' : '33.3%',
  'left' : '0%',
  'background-color' : 'white',
  'display' : 'none'
};

export const overlay = (text) => {
  const overlay = $('#overlay');
  overlay.fadeIn();
  overlay.click(() => overlay.fadeOut());
}

export const uiRemovePlayerInfo = (player) => {
  $(`#player-info-${player.index + 1}`).text('No Player');
}

export const uiSetPlayerInfo = (player) => {
  $(`#player-info-${player.index + 1}`).text(player.name);
}

export const uiSetCurrentPlayer = (index) => {
  $('.player-info-row').removeClass('table-info');
  $(`#player-info-row-${index + 1}`).addClass('table-info');
}

export const uiEnablePlayerKickButtons = (players, isHost, roomID, socket) => {
  for (let i = 0; i < 4; i++) {
    $(`#player-kick-${i + 1}`).prop('disabled', !isHost || !players[i] || players[i].isLocalPlayer);
    $(`#player-kick-${i + 1}`).click(() => {
      if (players[i]) {
        socket.emit('game-room-kick-player', roomID, players[i].index);
      }
    });
  }
}