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
  filePath = filePath.replace(/_/gi, ' ');
  const nameRegex = /^\[.*?]\s(.*)\s-\s.*$/i;
  const matches = filePath.match(nameRegex);

  if (matches.length >= 1) {
    return matches.pop();
  }

  return null;
};

/**
 * @param {String} string
 */
exports.isAnimeFile = function isAnimeFile(string) {
  //   ^ assert position at start of the string
  // \[ matches the character [ literally
  //     1st Capturing group (.*?)
  //   .*? matches any character (except newline)
  //   Quantifier: *? Between zero and unlimited times, as few times as possible, expanding as needed [lazy]
  // \] matches the character ] literally
  //     [\s\S] match a single character present in the list below
  // \s match any white space character [\r\n\t\f ]
  //   \S match any non-white space character [^\r\n\t\f ]
  //   2nd Capturing group (.*)
  //   .* matches any character (except newline)
  //   Quantifier: * Between zero and unlimited times, as many times as possible, giving back as needed [greedy]
  //     [\s\S] match a single character present in the list below
  // \s match any white space character [\r\n\t\f ]
  //   \S match any non-white space character [^\r\n\t\f ]
  //   - matches the character - literally
  //     [\s\S] match a single character present in the list below
  // \s match any white space character [\r\n\t\f ]
  //   \S match any non-white space character [^\r\n\t\f ]
  //   3rd Capturing group (\d*)
  //   \d* match a digit [0-9]
  //   Quantifier: * Between zero and unlimited times, as many times as possible, giving back as needed [greedy]
  //     [\s\S] match a single character present in the list below
  // \s match any white space character [\r\n\t\f ]
  //   \S match any non-white space character [^\r\n\t\f ]
  //   .* matches any character (except newline)
  //   Quantifier: * Between zero and unlimited times, as many times as possible, giving back as needed [greedy]
  // \. matches the character . literally
  //   4th Capturing group (mkv|mp4)
  //   1st Alternative: mkv
  //   mkv matches the characters mkv literally (case sensitive)
  //   2nd Alternative: mp4
  //   mp4 matches the characters mp4 literally (case sensitive)
  //   $ assert position at end of the string
  //   g modifier: global. All matches (don't return on first match)
  return /^\[(.*?)][\s\S](.*)[\s\S]-[\s\S](\d*)[\s\S].*\.(mkv|mp4)$/i.test(string);
};
