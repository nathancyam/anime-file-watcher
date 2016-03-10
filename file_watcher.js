/**
 * Created by nathanyam on 13/07/2014.
 */

/* jslint node: true */
"use strict";

var fs = require('fs');
var path = require('path');
var util = require('util');
var EventEmitter = require('events');
var AnimeUtil = require('./helpers');

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
    })
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
    })
  })
};

let lastFired = Date.now();

let FileWatcher = function FileWatcher(options) {
  EventEmitter.call(this);

  var animeDir;
  var _this = this;
  options.watchDir = options.download_path;
  options.mediaDir = options.anime_path;

  /**
   * @param {Object} event
   * @param {String} filename
   */
  let moveDirectory = function moveDirectory(event, filename) {
    var deltaLastExecution = Date.now() - lastFired;
    console.log(deltaLastExecution);
    if (deltaLastExecution < 1000) {
      return;
    }

    lastFired = Date.now();
    var originalPath = path.join(options.watchDir,  filename);
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
        var animeName = AnimeUtil.getAnimeName(filename);

        // If we can verify what the series was, then we should move it to the media folder
        animeDir = path.join(options.mediaDir, animeName);
        return fsStat(animeDir);
      })
      .then(result => {
        if (result.isDirectory()) {
          _this.emit('move_file', path.join(animeDir, filename));
          return fsRename(originalPath, path.join(animeDir, filename));
        }
      })
      .catch(err => {
        if (err.code === 'ENOENT' && err.errno === -2) {
          fs.mkdir(animeDir, function () {
            _this.emit('move_file', path.join(animeDir, filename));
            return fsRename(originalPath, path.join(animeDir, filename));
          });
        }
      });
  };

  fs.watch(options.watchDir, moveDirectory);
  console.log(`Now watching directory ${options.watchDir} and moving anime files to ${options.mediaDir}`);
};

util.inherits(FileWatcher, EventEmitter);

exports.FileWatcher = FileWatcher;

exports.AnimeFileWatcher = function AnimeFileWatcher(options, callback) {
  options.mediaDir = options.anime_path;
  console.log(`Now watching directory ${options.mediaDir}`);
  fs.watch(options.mediaDir, callback)
};

