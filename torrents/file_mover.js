/**
 * Created by nathanyam on 26/03/2016.
 */

"use strict";

const fs = require('fs');
const path = require('path');

const fsRename = (oldPath, newPath) => {
  return new Promise((resolve, reject) => {
    fs.rename(oldPath, newPath, err => {
      if (err) {
        console.error(err);
        return reject(err);
      }
      return resolve(true);
    });
  });
};

class FileMover {

  /**
   * @param {Transmission} torrentServer
   */
  constructor(torrentServer) {
    this.torrentServer = torrentServer;
  }

  moveTorrentFiles(torrentId, destination) {
    return new Promise((resolve, reject) => {
      this.torrentServer.get((err, res) => {
        const torrent = res.torrents.find(el => el.id == torrentId);
        const files = torrent.files.map(el => path.join(torrent.downloadDir, el.name));
        const promises = files.map(file => fsRename(file, path.join(destination, path.basename(file))));

        Promise.all(promises)
          .then(result => {
            resolve(result);
          })
          .catch(err => reject(err));
      });
    });
  }

}

module.exports = FileMover;