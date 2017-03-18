'use strict';

const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const crypto = require('crypto');

const config = JSON.parse(fs.readFileSync(__dirname + '/client.json').toString());
// const redisSub = new Redis(6379, config.redis.host);

const updateUrl = config.update_url;
const torrentUpdateUrl = config.torrent_server.update_url;
const auth = config.auth;
const updateClient = require('./update_client');
const Transmission = require('transmission');
const FileMover = require('./torrents/file_mover');
const torrentServer = new Transmission({
  host: config.torrent_server.host,
  port: config.torrent_server.port,
  username: config.torrent_server.username,
  password: config.torrent_server.password
});
const fileMover = new FileMover(torrentServer);
const DownloadFileWatcher = require('./file_watcher').FileWatcher;
const Rx = require('rx');

const downloadFileWatcher = new DownloadFileWatcher(config.anime_directory);

const source = Rx.Observable.fromEvent(downloadFileWatcher, 'move_file')
  .distinct()
  .subscribe(filename => {
    const payload = {
      action: ACTION_NEW_FILE,
      filename: path.basename(filename),
    };

    console.log(`Request: ${updateUrl}: ${JSON.stringify(payload)}`);
    updateClient.postJson(updateUrl, auth, payload);
  });

let previousTorrentsHash = '';
function postTorrentListing(response, forcePush) {
  forcePush = forcePush || false;
  const simpleFields = [
    'percentDone',
    'name',
    'id',
    'downloadLimited',
    'error',
    'eta',
    'status',
    'peersConnected',
    'name',
    'torrentFile',
  ];

  const simpleTorrents = response.torrents.map(torrent => {
    const simpleTorrent = {};
    simpleFields.forEach(field => simpleTorrent[field] = torrent[field]);
    return simpleTorrent;
  });

  const currentTorrentHash = crypto.createHash('md5')
    .update(JSON.stringify(simpleTorrents))
    .digest('hex');

  if (forcePush) {
    previousTorrentsHash = currentTorrentHash;
    updateClient.postJson(torrentUpdateUrl, auth, {
      torrentServer: simpleTorrents,
    });
    return;
  }

  if (!forcePush && currentTorrentHash !== previousTorrentsHash) {
    previousTorrentsHash = currentTorrentHash;
    updateClient.postJson(torrentUpdateUrl, auth, {
      torrentServer: simpleTorrents,
    });
    return;
  }
}

setInterval(() => {
  torrentServer.get((err, response) => {
    return postTorrentListing(response);
  });
}, 5000);


const io = require('socket.io-client');
console.info('Establishing WS connection with server');

const socketOptions = {
  extraHeaders: {
    'AnimeTorrentUser': config.socket.user,
    'Authorization': config.socket.auth
  },
  reconnection: true,
  reconnectionAttempts: 3,
};
const socket = io(config.socket.url, socketOptions);
const socketHandler = require('./socket');
socketHandler(socket, torrentServer, fileMover, postTorrentListing);
console.info(`Starting download file child process`);
downloadFileWatcher.watch();
