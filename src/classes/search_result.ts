import {
   SearchResultJSON,
   EpisodeDataJSON,
   EpisodesOptions,
} from '../interfaces';
import { PropClass } from './prop_class';
import { parse } from 'node-html-parser';
import { Aigle } from 'aigle';
import * as _ from 'lodash';
import { instance } from '../axios_instance';
import { FCDN, MirrorType } from './mirrors';
import { AxiosResponse, AxiosError } from 'axios';
import * as filterer from '../funcs/filter_string';
import * as qs from 'querystring';

export class EpisodeData extends PropClass<EpisodeDataJSON> {
   constructor(props: EpisodeDataJSON) {
      super(props);
      this._props.sources = props.sources || [];
   }

   get name() {
      return this._props.name;
   }
   get link() {
      return this._props.link;
   }
   get ep() {
      return this._props.ep;
   }
   get sources() {
      return this._props.sources;
   }

   async getSources() {
      try {
         const episode: AxiosResponse<string> = await instance
            .get(this.link || '')
            .catch((e: AxiosError) => {
               throw e.toJSON();
            });
         const document = parse(episode.data);
         const frame = document.querySelector(
            'div.watch_play > div.play-video > iframe'
         );
         const src = new URL('https:' + frame.attributes.src);
         const episodeID = src.searchParams.get('id') || '';
         // console.log(episodeID);
         const sources = await this.getPossibleDownloads(episodeID);
         this._props.sources = sources;
         return this._props.sources;
      } catch (e) {
         throw e;
      }
   }

   protected async getPossibleDownloads(id: string) {
      try {
         const query = qs.stringify({
            id,
         });
         const download = await instance.get('/download' + query);
         console.log(download.data);
         const document = parse(download.data);
         const mirrors = document.querySelectorAll('div.mirror_link a');
         console.log(mirrors);
         const supportedMirrors = mirrors
            .map(e => {
               return {
                  links: e.getAttribute('href') || '',
                  name: e.textContent.trim(),
               };
            })
            .filter(e => /(HDP|XSTREAMCDN)/i.test(e.name))
            .map(e => {
               e.name = e.name
                  .replace(/(download|\s*)/gi, '')
                  .replace(/[\(\)]/gi, '')
                  .replace(/mp4/gi, '')
                  .replace(/[\W]/gi, '')
                  .trim()
                  .toUpperCase();
               // console.log(e.name)
               if (e.name.match(/HDP/i))
                  return new MirrorType({
                     ...e,
                     code: 0,
                  });
               if (e.name.match(/xstreamcdn/i))
                  return new FCDN({
                     ...e,
                     code: 1,
                  });
               return new MirrorType<null, string>({
                  ...e,
                  code: null,
               });
            });
         return supportedMirrors;
      } catch (e) {
         if (e.isAxiosError) {
            return e.toJSON();
         }
         throw e;
      }
   }
}

export class SearchResult extends PropClass<SearchResultJSON> {
   private _episodes: EpisodeData[];

   constructor(props: SearchResultJSON) {
      super(props);
      this._episodes = _.map(props.episodes, ep => new EpisodeData(ep));
   }

   get title() {
      return this._props.title;
   }
   get link() {
      return this._props.link;
   }
   get eps() {
      return this._episodes.length;
   }
   get episodes() {
      return this._episodes;
   }

   async getEpisodes(options?: EpisodesOptions) {
      try {
         options = options || {};
         const filtered = filterer.format(
            options.filter,
            this._episodes.length
         );
         const filterIterator = (_ep: EpisodeData) => {
            if (filtered) {
               if (filtered[0] === '-') {
                  return !_.includes(filtered, _ep.ep) || false;
               }
               return _.includes(filtered, _ep.ep) || false;
            }
            return true;
         };
         const asyncIterator = async (ep: EpisodeData) => {
            return ep.getSources();
         };
         const promiseChain = _.chain(this._episodes)
            .filter(filterIterator)
            .map(asyncIterator)
            .value();
         await Promise.all(promiseChain);
         this._episodes = _.sortBy(this._episodes, ['ep']);
         this._props.episodes = this._episodes.map(e => e.get());
         return this._episodes;
      } catch (e) {
         throw e;
      }
   }
}
