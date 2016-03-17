/**
 * Created by nathanyam on 13/07/2014.
 */

/* jslint node: true */
'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');
var EventEmitter = require('events').EventEmitter;
var AnimeUtil = require('./helpers');

/** @typedef {{anime_path: String, download_path: String}} FileWatcherOptions */

/**
 * @param {String} path
 * @returns {Promise.<Object>}
 */
let fsStat = function (path) {
  return new Promise((resolve, reject) => {
    fs.stat(path, (err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result);
    });
  });
};

/**
 * @param {String} originalPath
 * @param {String} newPath
 * @returns {Promise.<Object>}
 */
let fsRename = function (originalPath, newPath) {
  return new Promise((resolve, reject) => {
    fs.rename(originalPath, newPath, (err, result) => {
      if (err) {
        return reject(err);
      }

      return resolve(result);
    });
  });
};

class FileWatcher extends EventEmitter {

  /**
   * @param {FileWatcherOptions} options
   */
  constructor(options) {
    super();
    this.animeDir = '';
    this.lastFired = Date.now();
    this.animeDir = options.anime_path;
    this.watchDir = options.download_path;
  }

  onMoveDirectory(event, filename) {
    const deltaLastExecution = Date.now() - this.lastFired;
    console.log(deltaLastExecution);
    if (deltaLastExecution < 1000) {
      return;
    }

    this.lastFired = Date.now();
    const originalPath = path.join(this.watchDir, filename);
    console.log(`DEBUG: Detected file: ${originalPath}`);

    fsStat(originalPath)
      .then(result => {
        // Is this change not a file or not a rename event?
        if (!result.isFile() || event !== 'rename') {
          return;
        }

        // Check if the filename is a valid anime file name
        if (!AnimeUtil.isAnimeFile(filename)) {
          return;
        }

        // If the anime is valid, then find out what series it is
        const animeName = AnimeUtil.getAnimeName(filename);

        // If we can verify what the series was, then we should move it to the media folder
        this.animeDir = path.join(this.mediaDir, animeName);
        return fsStat(this.animeDir);
      })
      .then(result => {
        if (result.isDirectory()) {
          this.emit('move_file', path.join(this.animeDir, filename));
          return fsRename(originalPath, path.join(this.animeDir, filename));
        }
      })
      .catch(err => {
        if (err.code === 'ENOENT' && err.errno === -2) {
          fs.mkdir(this.animeDir, () => {
            this.emit('move_file', path.join(this.animeDir, filename));
            return fsRename(originalPath, path.join(this.animeDir, filename));
          });
        }
      });
  }

  watch() {
    fs.watch(this.watchDir, this.onMoveDirectory);
    console.log(`Watching directory ${this.watchDir}. Target: ${this.animeDir}`);
  }
}

exports.FileWatcher = FileWatcher;
