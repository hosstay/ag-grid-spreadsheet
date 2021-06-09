import {inject} from 'aurelia-framework';
import {HttpClient, json} from 'aurelia-fetch-client';
import {errorHandler, debugLog} from './utility';
import {decrypt} from './security';

/*
  Class for easy fetching using the decrypt & check success pattern.
  Also allows for easy cacheing.

  Usage:

  const response = await this.dataLoader.httpFetch({
    prefix: 'api/your/prefix/',
    endpoint: endpoint,
    payload: {
      data: yourData
    },
    useCache: true,
    customCacheName: endpoint + '/' + customNamePostfix
  });

  if result returned back has noDecrypt = true, doesn't decrypt result
*/

@inject(HttpClient)
export class DataLoader {
  constructor(httpClient) {
    console.log('hello');
    this.httpClient = httpClient;
    this.cache = [];
  }

  addToCache(data, options) {
    const name = options.customCacheName === undefined ? options.endpoint : options.customCacheName;

    this.cache.push({
      name: name,
      data: data
    });
  }

  getCacheAtIndex(index) {
    return this.cache[index].data;
  }

  deleteCacheAtIndex(index) {
    this.cache.splice(index, 1);
  }

  findIndexInCache(options) {
    const list = this.cache;
    const endpoint = options.customCacheName === undefined ? options.endpoint : options.customCacheName;

    const index = list.findIndex((item) => {
      return item.name === endpoint;
    });

    return index;
  }

  async fetch(options) {
    try {
      debugLog('-------------------------');
      debugLog('fetching...');
      debugLog(options);

      if (!options.payload) {
        options.payload = {};
      }

      if (options.db) {
        options.payload.db = options.db;
      }

      const response = await this.httpClient.fetch(options.prefix + options.endpoint, {
        method: 'post',
        body: json(options.payload)
      });
      console.log('response');
      console.log(response);
      let data = await response.json();
      console.log('data');
      console.log(data);

      // debugLog('non-decrypted data');
      // debugLog(data);

      if (data && data.noDecrypt) {
        data = data;
      } else {
        data = decrypt(data);
      }

      debugLog('data');
      debugLog(data);

      if (data.success) {
        debugLog('success');

        if (options.useCache) {
          this.addToCache(data.result, options);
        }

        return data.result;
      } else {
        debugLog('data.result');
        debugLog(data.result);

        return errorHandler({err: data.result, context: 'fetch failure'});
      }
    } catch (err) {
      return errorHandler({err: err, context: 'fetch'});
    }
  }

  async httpFetch(options) {
    try {
      let cacheIndex = -1;

      if (options.useCache) {
        cacheIndex = this.findIndexInCache(options);
      }

      if (cacheIndex > -1) {
        return this.getCacheAtIndex(cacheIndex);
      } else {
        return await this.fetch(options);
      }
    } catch (err) {
      return errorHandler({err: err, context: 'httpFetch'});
    }
  }
}