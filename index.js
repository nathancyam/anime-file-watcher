"use strict";

const ACTION_ADD_TORRENT = 'add_torrent';
const ACTION_NEW_FILE = 'new_file';

var fs = require('fs');
var Redis = require('ioredis');

var config = JSON.parse(fs.readFileSync(__dirname + '/client.json').toString());
var redisSub = new Redis(6379, config.redis.host);
var redisPub = new Redis(6379, config.redis.host);
var Transmission = require('./transmission');
var torrentServer = new Transmission(config.torrent_server);
var DownloadFileWatcher = require('./file_watcher').FileWatcher;

var downloadFileWatcher = new DownloadFileWatcher(config.anime_directory);
downloadFileWatcher.on('move_file', (filename) => {
  var payload = {
    action: ACTION_NEW_FILE,
    filename: filename
  };

  // TODO: Replace this with a POST request instead?
  redisPub.publish('torrent', JSON.stringify(payload));
});

redisSub.subscribe('torrent', (err, count) => {
  console.log(`Currently subscribed to ${count} channels on ${config.redis.host}:6379. Listening on 'torrent' channel.`);
});

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
