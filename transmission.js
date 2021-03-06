/**
 * Created by nathanyam on 21/04/2014.
 */

/*jslint node: true */
"use strict";

const async = require('async');
const Q = require('q');
const Transmission = require('transmission');
const util = require('util');
const fs = require('fs');
const exec = require('child_process').exec;
const request = require('request');

/**
 * @constructor
 * @type {TransmissionWrapper}
 */

const TransmissionWrapper = module.exports = function TransmissionWrapper(options) {
  Transmission.call(this, options);
};

function execTorrent(filename, callback) {
  const cmd = `transmission-remote -a "${filename}"`;
  console.log('cmd', cmd);
  exec(cmd, (error, stdout, stderr) => {
    if (error || stderr) {
      console.error('Stderr', stderr);
      return callback(error);
    }

    console.log('Std out', stdout);

    return callback(null, {
      status: 'fulfilled',
      message: `Torrent added ${filename}`,
      name: {
        value: filename
      }
    })
  });
}

function addTorrent(url, name, callback) {
  if (url.includes('magnet')) {
    return execTorrent(url, callback);
  }

  const filename = `/var/torrents/${name}.torrent`;
  const writeStream = fs.createWriteStream(filename);
  request(url).pipe(writeStream);

  writeStream.on('finish', () => {
    execTorrent(filename, callback);
  });
}

/**
 * Format module for Transmission server responses.
 *
 * @type {{formatTorrentResponses: formatTorrentResponses, formatResponseToJson: formatResponseToJson}}
 */
const ResponseFormatter = {
  /**
   * Formats the results from the transmission torrent server to a presentable
   * JSON format.
   *
   * @see Q.allSettled()
   * @param responses Array of resolved promises from the Q.allSettled() method
   */
  formatTorrentResponses: function (responses) {
    const successfulTorrents = [];
    const failedTorrents = [];

    // Split the results to successful/failed additions
    responses.forEach(function (torrent) {
      switch (torrent.state) {
        case 'fulfilled':
          successfulTorrents.push(torrent);
          break;
        case 'rejected':
          failedTorrents.push(torrent);
          break;
        default:
          break;
      }
    });

    const response = {
      message: '',
      responses: {
        successful: this.formatResponseToJson('success', successfulTorrents),
        failed: this.formatResponseToJson('error', failedTorrents)
      }
    };

    if (successfulTorrents.length > 0 && failedTorrents.length === 0) {
      response.message = "Successfully added all torrents to server.";
    } else if (successfulTorrents.length > 0 && failedTorrents.length > 0) {
      response.message = "Failed to add some torrents to the server.";
    } else if (successfulTorrents.length === 0 && failedTorrents.length > 0) {
      response.message = "Failed to add all torrents to the server.";
    }

    return response;
  },
  /**
   * Formats the Transmission server responses to JSON.
   *
   * @param status String
   * @param responses Array
   */
  formatResponseToJson: function (status, responses) {
    let message = "%s %d torrent(s) to the torrent server.";

    if ('success' === status) {
      message = util.format(message, "Successfully added", responses.length);
    }
    if ('error' === status) {
      message = util.format(message, "Failed to add", responses.length);
    }

    return {
      message: message,
      numberOfTorrents: responses.length,
      torrents: responses.map(function (elem) {
        return elem.value.name
      })
    }
  }
};

TransmissionWrapper.prototype = Object.create(Transmission.prototype, {
  addMultipleTorrents: {
    /**
     * Adds multiple torrents to the Transmission server. Returns a promise containing
     * the responses from the torrent server.
     *
     * @param torrents Array of torrent hyperlinks to be added to the torrent server
     * @returns {Promise<Array>} A promise for the responses from the torrent server
     */
    value: function (torrents) {
      // Create the promise to add an torrent
      const self = this;
      const deferred = Q.defer();

      // Create an array of promises
      const torrentPromiseArray = torrents.map(function (e) {
        return self.enhancedAdd(e);
      });

      // Once the array of promises is fulfilled, we format them appropriately.
      Q.allSettled(torrentPromiseArray).then(
        function (results) {
          return deferred.resolve(ResponseFormatter.formatTorrentResponses(results));
        },
        function (err) {
          return deferred.reject(err);
        }
      );

      return deferred.promise;
    }
  },
  add: {
    value: function ({torrentUrl, name}, options) {
      return this.enhancedAdd(torrentUrl, name, options)
    }
  },
  enhancedAdd: {
    /**
     * Wrapper to add torrents to the Transmission server. Handles errors slightly
     * better to ensure we can see the URL was not successfully added to the torrent
     * server.
     *
     * @param {String} url
     * @param {String} name
     * @returns {*}
     */
    value: function (url, name) {
      return new Promise((resolve, reject) => {
        addTorrent(url, name, function (err, result) {
          if (err) {
            var parseJsonErr = JSON.parse(err.result);
            parseJsonErr.arguments.url = url;
            err.result = JSON.stringify(parseJsonErr);
            return reject(err);
          } else {
            return resolve(result);
          }
        });
      });
    }
  }
});

module.exports = TransmissionWrapper;
