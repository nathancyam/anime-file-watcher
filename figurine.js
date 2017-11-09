const http = require('http');
const cheerio = require('cheerio');
const crypto = require('crypto');
const _ = require('lodash');

const AMIAMI_ALTER_URL = 'http://slist.amiami.com/top/search/list?page=39&pagemax=50&s_maker_id=56&s_agelimit=0&s_st_list_backorder_available=1&s_st_list_newitem_available=1&s_st_list_preorder_available=1';

const cachedVersion = {
  _id: '',
  products: [],
  timestamp: 0,
};

function md5(data) {
  return crypto.createHash('md5').update(data).digest("hex");
}

function log(pairs = {}) {
  const logStr = Object.keys(pairs)
    .map(key => `${key}=${JSON.stringify(pairs[key])}`)
    .join(' ');

  const now = (new Date()).toLocaleString();
  console.log(`[${now}] ${logStr}`);
}

function request(url) {
  const startTimestamp = Date.now();
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      const { statusCode } = res;

      let error;
      if (statusCode !== 200) {
        error = new Error('Request Failed.\n' +
          `Status Code: ${statusCode}`);
      }

      if (error) {
        console.error(error.message);
        // consume response data to free up memory
        res.resume();
        return reject(error);
      }

      res.setEncoding('utf8');
      let rawData = '';
      res.on('data', (chunk) => { rawData += chunk; });
      res.on('end', () => {
        try {
          const elapsed = Date.now() - startTimestamp;
          log({ msg: 'request_time', time: elapsed });
          return resolve(rawData);
        } catch (e) {
          const elapsed = Date.now() - startTimestamp;
          log({ msg: 'failed_request', time: elapsed });
          return reject(e);
        }
      });
    }).on('error', (e) => {
      return reject(e);
    });
  });
}

async function execute() {
  const htmlResponse = await request(AMIAMI_ALTER_URL);
  const $ = cheerio.load(htmlResponse);

  const products$ = $('.product_box');
  const products = products$.toArray().map(parseProductBox);
  const newCollectionHash = md5(products.map(product => product._id).join());

  if (cachedVersion.products.length === 0 || cachedVersion._id === newCollectionHash) {
    log({ msg: 'no_products_found', productsCount: products.length });
    cachedVersion._id = newCollectionHash;
    cachedVersion.products = products;
    return { status: 'NO_CHANGE', cacheId: cachedVersion._id };
  }

  if (cachedVersion.length !== 0 && newCollectionHash !== cachedVersion._id) {
    const difference = _.differenceBy(products, cachedVersion.products, '_id');
    log({ msg: 'new_products_found', newProducts: difference.length });
    cachedVersion._id = newCollectionHash;
    cachedVersion.products = products;
    return { status: 'CHANGE', difference, cacheId: cachedVersion._id };
  }
}

function parseProductBox(productEl) {
  const $product = cheerio.load(productEl);

  function getReleaseType() {
    const classSelector = $product('.product_icon > div').attr('class');
    if (!classSelector) {
      return 'n/a';
    }
    return classSelector.substring(5);
  }

  const product =  {
    name: $product('.product_name_list a').text().trim(),
    href: $product('.product_name_list a').attr('href'),
    image: $product('.product_img img').attr('src'),
    releaseType: getReleaseType().trim(),
    price: $product('.product_price').text().trim(),
    discount: false,
    discountAmount: '0',
  };

  const priceRegex = /(\d{1,2}% OFF)\s{1,}(\S{1,} JPY)/m;

  const productPrice = {
    discount: priceRegex.test(product.price),
    price: product.price,
  };

  const matches = productPrice.discount
    ? product.price.match(priceRegex)
    : [];

  if (matches.length === 3) {
    const [_whole, discount, actualPrice] = matches;
    product.price = actualPrice;
    product.discount = true;
    product.discountAmount = discount;
  }

  product._id = md5(product.name);

  return product;
}

async function check() {
  try {
    return await execute();
  } catch (error) {
    console.error(error);
    return { status: 'ERROR', error };
  }
}

module.exports = check;

