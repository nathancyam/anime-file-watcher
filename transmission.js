/**
 * Created by nathanyam on 21/04/2014.
 */

/*jslint node: true */
"use strict";

var async = require('async');
var Q = require('q');
var Transmission = require('transmission');
var util = require('util');
var fs = require('fs');
const request = require('request');

/**
 * @constructor
 * @type {TransmissionWrapper}
 */

var TransmissionWrapper = module.exports = function TransmissionWrapper(options) {
    Transmission.call(this, options);
};

function addTorrent(url, callback) {
    const filename = `/var/torrents/${Date.now()}.torrent`;
    const writeStream = fs.createWriteStream(filename);
    request(url).pipe(writeStream);

    writeStream.on('finish', () => {
      process.exec(`transmission-remote -a ${filename}`, (error) => {
        if (error) {
            return callback(error);
        }

        return callback(null, {
          status: 'fulfilled',
          message: `Torrent added ${filename}`,
          name: {
            value: filename
          }
        })
      });
    });
}

/**
 * Format module for Transmission server responses.
 *
 * @type {{formatTorrentResponses: formatTorrentResponses, formatResponseToJson: formatResponseToJson}}
 */
var ResponseFormatter = {
    /**
     * Formats the results from the transmission torrent server to a presentable
     * JSON format.
     *
     * @see Q.allSettled()
     * @param responses Array of resolved promises from the Q.allSettled() method
     */
    formatTorrentResponses: function (responses) {
        var successfulTorrents = [];
        var failedTorrents = [];

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

        var response = {
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
        var message = "%s %d torrent(s) to the torrent server.";

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
            var self = this;
            var deferred = Q.defer();

            // Create an array of promises
            var torrentPromiseArray = torrents.map(function (e) {
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
        value: function (url, options, cb) {
            if (Array.isArray(url)) {
                if (typeof options === 'function') {
                    cb = options;
                }
                var addMultiplePromise = Q.denodeify(this.addMultipleTorrents.bind(this));
                return addMultiplePromise(url);
            } else {
                return this.enhancedAdd(url, options);
            }
        }
    },
    enhancedAdd: {
        /**
         * Wrapper to add torrents to the Transmission server. Handles errors slightly
         * better to ensure we can see the URL was not successfully added to the torrent
         * server.
         *
         * @param url
         * @returns {*}
         */
        value: function (url) {
            if (url.indexOf('http') !== 0) {
                url = `http:${url}`;
            }

            var deferred = Q.defer();

            addTorrent(url, function (err, result) {
                if (err) {
                    var parseJsonErr = JSON.parse(err.result);
                    parseJsonErr.arguments.url = url;
                    err.result = JSON.stringify(parseJsonErr);
                    return deferred.reject(err);
                } else {
                    return deferred.resolve(result);
                }
            });

            return deferred.promise;
        }
    }
});

module.exports = TransmissionWrapper;
