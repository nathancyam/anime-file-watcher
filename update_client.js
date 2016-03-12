/**
 * Created by nathanyam on 12/03/2016.
 */

"use strict";

const request = require('request');

/**
 * @param {String} url
 * @param {Object} postPayload
 * @returns {Promise.<Object>}
 */
exports.makeRequest = (url, postPayload) => {
  return new Promise((resolve, reject) => {
    request.post(url, { form: postPayload }, (err, resp, body) => {
      if (err) {
        console.error(`Failed to make update request with payload: ${postPayload}`);
        return reject(err);
      }

      console.log(`Successfully made update request with payload: ${postPayload}`);
      return resolve({ response: resp, body: body });
    });
  });
};

