"use strict";

const ACTION_ADD_TORRENT = 'add_torrent';
const ACTION_NEW_FILE = 'new_file';

const fs = require('fs');
const Redis = require('ioredis');

const config = JSON.parse(fs.readFileSync(__dirname + '/client.json').toString());
const redisSub = new Redis(6379, config.redis.host);
const updateUrl = config.update_url;
const torrentUpdateUrl = config.torrent_server.update_url;
const updateClient = require('./update_client');
const Transmission = require('./transmission');
const torrentServer = new Transmission(config.torrent_server);
const DownloadFileWatcher = require('./file_watcher').FileWatcher;

const downloadFileWatcher = new DownloadFileWatcher(config.anime_directory);

downloadFileWatcher.on('move_file', (filename) => {
  var payload = {
    action: ACTION_NEW_FILE,
    filename: filename
  };

  updateClient.makeRequest(updateUrl, payload);
});

redisSub.subscribe('torrent', (err, count) => {
  console.log(`Currently subscribed to ${count} channels on ${config.redis.host}:6379. Listening on 'torrent' channel.`);
});

setInterval(() => {
  torrentServer.get((err, response) => {
    const simpleFields = ['percentDone', 'name', 'id', 'downloadLimited', 'error', 'eta', 'peersConnected', 'name', 'torrentFile'];
    const simpleTorrents = response.torrents.map(torrent => {
      const simpleTorrent = {};
      simpleFields.forEach(field => simpleTorrent[field] = torrent[field]);
      return simpleTorrent;
    });

    updateClient.postJson(torrentUpdateUrl, {
      torrentServer: simpleTorrents
    })
  });
}, 5000);

redisSub.on('message', (channel, message) => {
  if (channel !== 'torrent') {
    return;
  }

  const payload = JSON.parse(message);
  switch (payload.action) {
    case ACTION_ADD_TORRENT:
      torrentServer.add(payload.torrentUrl)
        .then(res => console.log(`Torrent added successfully: ${payload.torrentUrl}`))
        .catch(err => console.error(`Failed to add torrent: ${payload.torrentUrl}\n Error: ${err}`));
      break;
    case ACTION_NEW_FILE:
      console.log(payload);
      break;
    default:
      break;
  }
});
