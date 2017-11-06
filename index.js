'use strict';

const ACTION_ADD_TORRENT = 'add_torrent';
const ACTION_NEW_FILE = 'new_file';
const ACTION_MOVE_TORRENT_FILE = 'move_torrent_file';
const ACTION_PAUSE_TORRENT = 'pause_torrent';
const ACTION_RESUME_TORRENT = 'resume_torrent';
const ACTION_FORCE_UPDATE = 'force_update';
const ACTION_TORRENT_SERVER_DOWN = 'torrent_server_down';
const ACTION_NEW_FIGURINE = 'new_figurine';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bunyan = require('bunyan');
const {EventEmitter} = require('events');
const log = bunyan.createLogger({ name: 'torrent_client_app' });

const config = JSON.parse(fs.readFileSync(__dirname + '/client.json').toString());
const io = require('socket.io-client');
const updateUrl = config.update_url;
const torrentUpdateUrl = config.torrent_server.update_url;
const auth = config.auth;
const updateClient = require('./update_client');
const Transmission = require('./transmission');
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
const FigurineWatcher = require('./figurine');

const downloadFileWatcher = new DownloadFileWatcher(config.anime_directory);
downloadFileWatcher.watch();

const exec = require('child_process').exec;
const execute = (cmd) => {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, stdOut) => {
      if (err) {
        return reject(err);
      }
      return resolve(stdOut);
    })
  });
};

Rx.Observable.fromEvent(downloadFileWatcher, 'move_file')
  .distinct()
  .subscribe(filename => {
    const payload = {
      action: ACTION_NEW_FILE,
      filename: path.basename(filename),
    };

    log.info(`Request: ${updateUrl}`, payload);
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
  }
}

const socket = io(config.socket.torrent_channel, config.socket.options);
class TorrentEventEmitter extends EventEmitter {}
const torrentHandler = new TorrentEventEmitter();

let isUp = true;
setInterval(() => {
  torrentServer.get((err, response) => {
    if (err && isUp) {
      isUp = false;
      log.error('Torrent server unavailable', err);
      return socket.emit(
        'torrent_client',
        {
          action: ACTION_TORRENT_SERVER_DOWN,
          status: 'fail',
          message: '[Client] Torrent server not responding',
        }
      )
    }

    if (!isUp && response) {
      isUp = true;
      log.info('Torrent server recovered');
      socket.emit(
        'torrent_client',
        {
          action: ACTION_TORRENT_SERVER_DOWN,
          status: 'ok',
          message: '[Client] Torrent server is now responding',
        }
      )
    }

    if (response) {
      log.info('Torrent server heartbeat');
      return postTorrentListing(response);
    }
  });
}, 5000);

torrentHandler.on(ACTION_ADD_TORRENT, payload => {
  let torrentUrl = payload.torrentUrl;
  torrentServer.add(payload)
    .then(() => {
      log.info(`Torrent added successfully: ${payload.name} - ${torrentUrl}`);
      socket.emit('torrent_client', {
        action: ACTION_ADD_TORRENT,
        status: 'ok',
        message: `[Client] Torrent added successfully: ${payload.name}`
      });
    })
    .catch(err => {
      log.info(`Failed to add torrent: ${payload.name} -  ${torrentUrl} Error: ${err}`);
    });
});

torrentHandler.on(ACTION_MOVE_TORRENT_FILE, payload => {
  fileMover.moveTorrentFiles(payload.torrentId, payload.destinationDirectory);
});

torrentHandler.on(ACTION_RESUME_TORRENT, payload => {
  execute(`transmission-remote -t ${payload.torrentId} -s`)
    .then(() => {
      console.log(`Started Torrent: ${payload.torrentId}`);
      socket.emit('torrent_client', {
        action: ACTION_RESUME_TORRENT,
        status: 'ok',
        message: `[Client] Started torrent: ${payload.torrentId}`,
      });
    })
    .catch(err => {
      log.error('Failed to stop torrent', err);
    });
});

torrentHandler.on(ACTION_PAUSE_TORRENT, payload => {
  execute(`transmission-remote -t ${payload.torrentId} -S`)
    .then(() => {
      log.info(`Paused Torrent: ${payload.torrentId}`);
      socket.emit('torrent_client', {
        action: ACTION_PAUSE_TORRENT,
        status: 'ok',
        message: `[Client] Paused torrent: ${payload.torrentId}`,
      });
    })
    .catch(err => {
      log.error(`Failed to stop torrent`, err);
      socket.emit('torrent_client', {
        action: ACTION_PAUSE_TORRENT,
        status: 'fail',
        message: `[Client] Unsuccessfully paused torrent: ${payload.torrentId}`,
      });
    });
});

torrentHandler.on(ACTION_FORCE_UPDATE, () => {
  torrentServer.get((err, response) => {
    return postTorrentListing(response, true);
  });
});

socket.on('connect', function () {
  log.info('Socket connected', this.id);
});

socket.on('disconnect', function () {
  log.info('Socket disconnected', this.id);
});

socket.on('torrent', payload => {
  log.info('Socket: Payload', payload);
  torrentHandler.emit(payload.action, payload);
});

const figurine$ = Rx.Observable.interval(1000 * 60 * 15)
  .mergeMap(() => Rx.Observable.fromPromise(FigurineWatcher()));

figurine$.filter(result => result.status === 'CHANGE')
  .subscribe(({ difference }) => {
    console.log(`${(new Date()).toLocaleString()} Difference found for figurine`, difference);
    socket.emit('figurine_watcher', {
      action: ACTION_NEW_FIGURINE,
      status: 'ok',
      message: JSON.stringify(difference),
    });
  });

figurine$.filter(result => result.status === 'NO_CHANGE')
  .subscribe(() => {
    console.log(`${(new Date()).toLocaleString()} - No Changes found`);
  });

log.info('Started torrent client application');
