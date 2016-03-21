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

class AnimeDirectory {
  constructor(rootDir, animeTitle) {
    this.hasAnimeDir = false;
    this.fullPath = path.join(rootDir, animeTitle);
  }

  /**
   * @returns {Promise.<AnimeDirectory>}
   */
  isPresent() {
    console.log('isPresent()');
    return fsStat(this.fullPath)
      .then(() => {
        this.hasAnimeDir = true;
        return this;
      })
      .catch(() => {
        this.hasAnimeDir = false;
        return this;
      });
  }

  /**
   * @returns {Promise<AnimeDirectory>}
   */
  mkdir() {
    return new Promise((resolve, reject) => {
      fs.mkdir(this.fullPath, (err) => {
        if (err) {
          return reject(err);
        }
        return resolve(this);
      })
    });
  }

  /**
   * @param originalPath
   * @returns {Promise.<AnimeDirectory>}
   */
  moveFile(originalPath) {
    this.fullFilePath = path.join(this.fullPath, path.basename(originalPath));
    return fsRename(originalPath, this.fullFilePath)
      .then(() => Promise.resolve(this));
  }
}

class FileWatcher extends EventEmitter {

  /**
   * @param {FileWatcherOptions} options
   */
  constructor(options) {
    super();
    this.animeDir = '';
    this.animeDir = options.anime_path;
    this.watchDir = options.download_path;
  }

  onMoveDirectory(event, filename) {
    const originalPath = path.join(this.watchDir, filename);

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
        const animeDirectory = new AnimeDirectory(this.animeDir, animeName);
        return animeDirectory.isPresent();
      })
      .then(animeDir => {
        if (animeDir.hasAnimeDir) {
          return animeDir.moveFile(originalPath);
        }

        return animeDir
          .mkdir()
          .then(animeDir => animeDir.moveFile(originalPath));
      })
      .then(animeDir => this.emit('move_file', animeDir.fullFilePath))
      .catch(err => {
        console.error(err);
      });
  }

  watch() {
    fs.watch(this.watchDir, this.onMoveDirectory.bind(this));
    console.log(`Watching directory ${this.watchDir}. Target: ${this.animeDir}`);
  }
}

exports.FileWatcher = FileWatcher;
