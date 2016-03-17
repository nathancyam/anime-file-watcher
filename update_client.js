// jscs:disable requireShorthandArrowFunctions
/**
 * Created by nathanyam on 12/03/2016.
 */

'use strict';

const request = require('request');

/**
 * @param {String} url
 * @param auth
 * @param {Object} postPayload
 * @returns {Promise.<Object>}
 */
exports.makeRequest = (url, auth, postPayload) => {
  return new Promise((resolve, reject) => {
    request.post(url, { form: postPayload }, auth, (err, resp, body) => {
      if (err) {
        console.error(`Failed to make update request with payload: ${postPayload}`);
        return reject(err);
      }

      console.log(`Successfully made update request with payload: ${postPayload}`);
      return resolve({ response: resp, body: body });
    });
  });
};

exports.postJson = (url, jsonPayload) => {
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

      console.log(`Successfully made JSON request with payload: ${jsonPayload}`);
      return resolve({ response: resp, body: body });
    });

  });
};
