const ACTION_ADD_TORRENT = 'add_torrent';
const ACTION_NEW_FILE = 'new_file';
const ACTION_MOVE_TORRENT_FILE = 'move_torrent_file';
const ACTION_PAUSE_TORRENT = 'pause_torrent';
const ACTION_RESUME_TORRENT = 'resume_torrent';
const ACTION_FORCE_UPDATE = 'force_update';

const exec = require('child_process').exec;
const execute = (cmd) => {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdOut, stdErr) => {
      if (err) {
        return reject(err);
      }
      return resolve(stdOut);
    })
  });
};

function handleConnection(socket) {
  socket.on('connect', () => {
    console.log(`Successfully connected to server`);
  });

  socket.on('connect_error', (err) => {
    console.error(`Failed to connect to WS server`, err);
  });

  socket.on('connect_timeout', (err) => {
    console.error(`Timeout while attempting connect to WS server`, err);
  });
  
  socket.on('error', (err) => {
    console.error(err)
  });
}

function handleTorrentMessages(socket, torrentServer, fileMover, postTorrentListing) {
  socket.on(ACTION_ADD_TORRENT, (payload, serverCallback) => {
    let torrentUrl = payload.torrentUrl;
    if (torrentUrl.indexOf('http:') !== 0) {
      torrentUrl = `http:${torrentUrl}`;
    }

    torrentServer.add(torrentUrl, (err, res) => {
      if (err) {
        console.error(`Failed to add torrent: ${payload.torrentUrl} Error: ${err}`);
        return serverCallback({ status: 'err', message: err.message });
      }

      return serverCallback({ status: 'ok', message: `Torrent added successfully: ${payload.torrentUrl}`});
    });
  });

  socket.on(ACTION_MOVE_TORRENT_FILE, (payload, serverCallback) => {
    fileMover.moveTorrentFiles(payload.torrentId, payload.destinationDirectory);
    return serverCallback({ status: 'ok', message: 'Received message' });
  });

  socket.on(ACTION_MOVE_TORRENT_FILE, (payload, serverCallback) => {
    return serverCallback({ status: 'ok', message: 'Received message' });
  });

  socket.on(ACTION_PAUSE_TORRENT, (payload, serverCallback) => {
    execute(`transmission-remote -t ${payload.torrentId} -S`)
      .then(() => {
        console.log(`Paused Torrent: ${payload.torrentId}`);
        return serverCallback({ status: 'ok', message: `Paused torrent: ${payload.torrentId}`});
      })
      .catch(err => {
        console.error(`Failed to stop torrent`);
        console.error(err);
        return serverCallback({ status: 'err', message: err.message });
      });
  });
  
  socket.on(ACTION_RESUME_TORRENT, (payload, serverCallback) => {
    execute(`transmission-remote -t ${payload.torrentId} -s`)
      .then(() => {
        console.log(`Started Torrent: ${payload.torrentId}`)
        return serverCallback({ status: 'ok', message: `Resumed torrent: ${payload.torrentId}`});
      })
      .catch(err => {
        return serverCallback({ status: 'err', message: err.message });
      });
  });

  socket.on(ACTION_FORCE_UPDATE, (payload, serverCallback) => {
    torrentServer.get((err, response) => {
      serverCallback({ status: 'ok', message: 'Receieved force update' });
      return postTorrentListing(response, true);
    });
  })
}

module.exports = (socket, torrentServer, fileMover, postTorrentListing) => {
  handleConnection(socket);
  handleTorrentMessages(socket, torrentServer, fileMover, postTorrentListing);
};
