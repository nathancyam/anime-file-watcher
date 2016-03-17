/**
 * Created by nathanyam on 2/03/2016.
 */

'use strict';

/**
 * Gets the anime name from the file path
 *
 * @param filePath
 */
exports.getAnimeName = function (filePath) {
  filePath = filePath.replace('_', ' ');
  let nameRegex = new RegExp(']\\s(.*)\\s-', 'g');
  let matches = nameRegex.exec(filePath);

  if (matches.length >= 1) {
    return matches.pop();
  }

  return null;
};

/**
 * @param {String} string
 */
exports.isAnimeFile = function isAnimeFile(string) {
  const findSub = string.match(/^\[/i);
  let isAnime = false;

  if (findSub !== null && findSub.length > 0) {
    var fileType = string.split('.').pop();
    switch (fileType) {
      case 'mkv':
      case 'mp4':
        isAnime = true;
        break;
      default:
        break;
    }
  }

  return isAnime;
};
