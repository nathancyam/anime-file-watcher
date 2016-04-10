'use strict';

const ACTION_ADD_TORRENT = 'add_torrent';
const ACTION_NEW_FILE = 'new_file';
const ACTION_MOVE_TORRENT_FILE = 'move_torrent_file';
const ACTION_PAUSE_TORRENT = 'pause_torrent';
const ACTION_RESUME_TORRENT = 'resume_torrent';
const ACTION_FORCE_UPDATE = 'force_update';

const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const crypto = require('crypto');

const config = JSON.parse(fs.readFileSync(__dirname + '/client.json').toString());
const redisSub = new Redis(6379, config.redis.host);
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
downloadFileWatcher.watch();

var exec = require('child_process').exec;
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

const source = Rx.Observable.fromEvent(downloadFileWatcher, 'move_file')
  .distinct()
  .subscribe(filename => {
    var payload = {
      action: ACTION_NEW_FILE,
      filename: path.basename(filename),
    };

    console.log(`Request: ${updateUrl}: ${JSON.stringify(payload)}`);
    updateClient.postJson(updateUrl, auth, payload);
  });

redisSub.subscribe('torrent', (err, count) => {
  console.log(
    `Subscribed to ${count} channels: ${config.redis.host}:6379. Listening on 'torrent' channel.`
  );
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

redisSub.on('message', (channel, message) => {
  if (channel !== 'torrent') {
    return;
  }

  const payload = JSON.parse(message);
  console.log(payload);
  switch (payload.action) {
    case ACTION_ADD_TORRENT:
      let torrentUrl = payload.torrentUrl;
      if (torrentUrl.indexOf('http:') !== 0) {
        torrentUrl = `http:${torrentUrl}`;
      }
      torrentServer.add(torrentUrl, (err, res) => {
        if (err) {
          console.error(`Failed to add torrent: ${payload.torrentUrl} Error: ${err}`);
        }

        console.log(`Torrent added successfully: ${payload.torrentUrl}`);
      });
      break;

    case ACTION_NEW_FILE:
      break;

    case ACTION_MOVE_TORRENT_FILE:
      fileMover.moveTorrentFiles(payload.torrentId, payload.destinationDirectory);
      break;

    case ACTION_PAUSE_TORRENT:
      execute(`transmission-remote -t ${payload.torrentId} -S`)
        .then(() => console.log(`Paused Torrent: ${payload.torrentId}`))
        .catch(err => {
          if (err) {
            console.error(`Failed to stop torrent`);
            console.error(err);
          }
        });
      break;

    case ACTION_RESUME_TORRENT:
      execute(`transmission-remote -t ${payload.torrentId} -s`)
        .then(() => console.log(`Started Torrent: ${payload.torrentId}`))
        .catch(err => {
          if (err) {
            console.error(`Failed to stop torrent`);
            console.error(err);
          }
        });
      break;

    case ACTION_FORCE_UPDATE:
      torrentServer.get((err, response) => {
        return postTorrentListing(response, true);
      });
      break;

    default:
      break;
  }
});
