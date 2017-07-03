// jscs:disable requireShorthandArrowFunctions
/**
 * Created by nathanyam on 12/03/2016.
 */

'use strict';

const request = require('request');

/**
 * @param url
 * @param auth
 * @param jsonPayload
 * @returns {Promise<T>|Promise}
 */
exports.postJson = (url, auth, jsonPayload) => {
  return new Promise((resolve, reject) => {
    const options = {
      method: 'POST',
      body: jsonPayload,
      json: true,
      url: url,
    };

    request(options, (err, resp, body) => {
      if (err) {
        console.error(`Failed to make JSON request with payload: ${jsonPayload}`);
        return reject(err);
      }
      return resolve({ response: resp, body: body });
    });

  });
};
