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
    console.log(options);
  }

  onMoveDirectory(event, filename) {
    this.lastFired = Date.now();
    const originalPath = path.join(this.watchDir, filename);
    let _animeDirectory = '';
    console.log(`DEBUG: Detected file: ${originalPath}`);

    fsStat(originalPath)
      .then(result => {

        // Is this change not a file or not a rename event?
        if (!result.isFile() || event !== 'rename') {
          return;
        }

        // Check if the filename is a valid anime file name
        if (!AnimeUtil.isAnimeFile(filename)) {
          console.log('Not anime file');
          return;
        }

        // If the anime is valid, then find out what series it is
        const animeName = AnimeUtil.getAnimeName(filename);
        console.log('Anime Name: ' + animeName);

        // If we can verify what the series was, then we should move it to the media folder
        _animeDirectory = path.join(this.animeDir, animeName);
        console.log('Anime Directory: ' + _animeDirectory);
        return fsStat(_animeDirectory);
      })
      .then(result => {
        console.log('Anime Directory Result: ' + result);
        if (result.isDirectory()) {
          console.log('Found directory. Moving file');
          this.emit('move_file', path.join(_animeDirectory, filename));
          return fsRename(originalPath, path.join(_animeDirectory, filename));
        }
      })
      .catch(err => {
        if (err.code === 'ENOENT' && err.errno === -2) {
          console.log('Could not find directory. Creating directory');
          fs.mkdir(_animeDirectory, () => {
            this.emit('move_file', path.join(_animeDirectory, filename));
            return fsRename(originalPath, path.join(this.animeDir, filename));
          });
        }
      });
  }

  watch() {
    fs.watch(this.watchDir, this.onMoveDirectory.bind(this));
    console.log(`Watching directory ${this.watchDir}. Target: ${this.animeDir}`);
  }
}

exports.FileWatcher = FileWatcher;
