var $ = require('jquery');
var _ = require('lodash');
var ZenzaWatch = {
  util:{},
  debug: {},
  api: {}
};
var Config = {};
var AsyncEmitter = function() {};
var PopupMessage = function() {};
var WindowMessageEmitter = function() {};
var isLogin = function() {};
var isSameOrigin = function() {};
var TOKEN = Math.random();
var ajax = function() {};

//===BEGIN===
    var CacheStorage = (function() {
      var PREFIX = 'ZenzaWatch_cache_';

      function CacheStorage() {
        this.initialize.apply(this, arguments);
      }

      _.assign(CacheStorage.prototype, {
        initialize: function(storage) {
          this._storage = storage;
        },
        setItem: function(key, data, expireTime) {
          key = PREFIX + key;
          var expiredAt =
            typeof expireTime === 'number' ? (Date.now() + expireTime) : '';
          console.log('%ccacheStorage.setItem', 'background: cyan;', key, typeof data, data);
          this._storage[key] = JSON.stringify({
            data: data,
            type: typeof data,
            expiredAt: expiredAt
          });
        },
        getItem: function(key) {
          key = PREFIX + key;
          if (!this._storage.hasOwnProperty(key)) {
            return null;
          }
          var item = null, data = null;
          try {
            item = JSON.parse(this._storage[key]);
            if (item.type === 'string') {
              data = item.data;
            } else if (typeof item.data === 'string') {
              data = JSON.parse(item.data);
            } else {
              data = item.data;
            }
          } catch(e) {
            window.console.error('CacheStorage json parse error:', e);
            window.console.log(this._storage[key]);
            this._storage.removeItem(key);
            return null;
          }

          if (item.expiredAt === '' || item.expiredAt > Date.now()) {
            return data;
          }
          return null;
        },
        removeItem: function(key) {
          key = PREFIX + key;
          if (!this._storage.hasOwnProperty(key)) {
            return null;
          }

          this._storage.removeItem(key);
        },
        clear: function() {
          var storage = this._storage;
          _.each(Object.keys(storage), function(v) {
            if (v.indexOf(PREFIX) === 0) {
              window.console.log('remove item', v, storage[v]);
              storage.removeItem(v);
            }
          });
        }
      });

      return CacheStorage;
    })();
    ZenzaWatch.api.CacheStorage = CacheStorage;
    ZenzaWatch.debug.localCache = new CacheStorage(localStorage);


    var VideoInfoLoader = (function() {
      var BASE_URL = location.protocol + '//ext.nicovideo.jp/thumb_watch';
      var loaderFrame, loaderWindow;
      var videoInfoLoader = new AsyncEmitter();
      var cacheStorage = new CacheStorage(sessionStorage);

      var onMessage = function(data, type) {
        if (type !== 'videoInfoLoader') { return; }
        console.log('VideoInfoLoader.onMessage', data, type);
        var info = data.message;

        //console.log('%cvideoInfoLoader.onThumbWatchInfoLoad', 'background: lightgreen;', info);
        videoInfoLoader.emitAsync('load', info, 'THUMB_WATCH');
      };

      // 外部プレイヤーと同じ方法で起動するやつ。 ログイン不要で動画が再生できる。
      // CrossDomainGateを使って書き直す。 そのうち
      var initializeCrossDomainGate = function() {
        initializeCrossDomainGate = _.noop;

        console.log('%c initialize videoInfoLoader', 'background: lightgreen;');

        loaderFrame = document.createElement('iframe');
        loaderFrame.name  = 'videoInfoLoaderLoader';
        loaderFrame.className = 'xDomainLoaderFrame thumb';
        document.body.appendChild(loaderFrame);

        loaderWindow = loaderFrame.contentWindow;

        WindowMessageEmitter.addKnownSource(loaderWindow);
        WindowMessageEmitter.on('onMessage', onMessage);
      };

      var loadFromThumbWatch = function(watchId) {
        initializeCrossDomainGate();
        //http://ext.nicovideo.jp/thumb_watch/sm9?cb=onPlayerLoaded&eb=onPlayerError
        var url = [
          BASE_URL, '/',
          watchId,
          '?cb=onPlayerLoaded&eb=onPlayerError'].join('');

        console.log('getVideoInfo: ', url);

        loaderWindow.location.replace(url);
      };
     //JSON.parse(decodeURIComponent(JSON.parse($('#watchAPIDataContainer').text()).flashvars.dmcInfo))
      var parseFromGinza = function(dom) {
        try {
          var watchApiData = JSON.parse(dom.querySelector('#watchAPIDataContainer').textContent);
          var videoId = watchApiData.videoDetail.id;
          var hasLargeThumbnail = ZenzaWatch.util.hasLargeThumbnail(videoId);
          var flvInfo = ZenzaWatch.util.parseQuery(
              decodeURIComponent(watchApiData.flashvars.flvInfo)
            );
          var dmcInfo = JSON.parse(
              decodeURIComponent(watchApiData.flashvars.dmcInfo || '{}')
            );
          var thumbnail =
            watchApiData.flashvars.thumbImage +
              (hasLargeThumbnail ? '.L' : '');
          var videoUrl = flvInfo.url;
          var isEco = /\d+\.\d+low$/.test(videoUrl);
          var isFlv = /\/smile\?v=/.test(videoUrl);
          var isMp4 = /\/smile\?m=/.test(videoUrl);
          var isSwf = /\/smile\?s=/.test(videoUrl);
          var isDmc = watchApiData.flashvars.isDmc === 1;
          var csrfToken = watchApiData.flashvars.csrfToken;
          var playlistToken = watchApiData.playlistToken;
          var watchAuthKey  = watchApiData.flashvars.watchAuthKey;
          var seekToken     = watchApiData.flashvars.seek_token;
          var msgInfo = {
            server:   flvInfo.ms,
            threadId: flvInfo.thread_id,
            duration: flvInfo.l,
            userId:   flvInfo.user_id,
            isNeedKey: flvInfo.needs_key === '1',
            optionalThreadId: flvInfo.optional_thread_id,
            userKey:  flvInfo.userkey,
            hasOwnerThread: !!watchApiData.videoDetail.has_owner_thread
          };

          var playlist =
            JSON.parse(dom.querySelector('#playlistDataContainer').textContent);
          var isPlayable = isMp4 && !isSwf && (videoUrl.indexOf('http') === 0);

          cacheStorage.setItem('csrfToken', csrfToken, 30 * 60 * 1000);

          var result = {
            _format: 'watchApi',
            watchApiData: watchApiData,
            flvInfo: flvInfo,
            dmcInfo: dmcInfo,
            msgInfo: msgInfo,
            playlist: playlist,
            isPlayable: isPlayable,
            isMp4: isMp4,
            isFlv: isFlv,
            isSwf: isSwf,
            isEco: isEco,
            isDmc: isDmc,
            thumbnail: thumbnail,
            csrfToken: csrfToken,
            playlistToken: playlistToken,
            watchAuthKey: watchAuthKey,
            seekToken: seekToken
          };

          ZenzaWatch.emitter.emitAsync('csrfTokenUpdate', watchApiData.flashvars.csrfToken);
          return result;

        } catch (e) {
          window.console.error('error: parseFromGinza ', e);
          return null;
        }
      };

      const parseFromHtml5Watch = function(dom) {
        const watchDataContainer = dom.querySelector('#js-initial-watch-data');
        const data = JSON.parse(watchDataContainer.getAttribute('data-api-data'));
        const env  = JSON.parse(watchDataContainer.getAttribute('data-environment'));

        const videoId = data.video.id;
        const hasLargeThumbnail = ZenzaWatch.util.hasLargeThumbnail(videoId);
        const flvInfo = {
          url: data.video.source
        };
        const dmcInfo = data.video.dmcInfo;
        const thumbnail = data.video.thumbnail + (hasLargeThumbnail ? '.L' : '');
        const videoUrl  = flvInfo.url;
        const isEco = /\d+\.\d+low$/.test(videoUrl);
        const isFlv = /\/smile\?v=/.test(videoUrl);
        const isMp4 = /\/smile\?m=/.test(videoUrl);
        const isSwf = /\/smile\?s=/.test(videoUrl);
        const isDmc = !!dmcInfo;
        const isChannel = !!data.channel;
        const isCommunity = !!data.community;
        const csrfToken     = data.context.csrfToken;
        const watchAuthKey  = data.context.watchAuthKey;
        const playlistToken = env.playlistToken;
        const msgInfo = {
          server:   data.thread.serverUrl,
          threadId: data.thread.ids.community || data.thread.ids.default,
          //threadId: data.thread.ids.default,
          duration: data.video.duration,
          userId:   data.viewer.id,
          isNeedKey: (isChannel || isCommunity), // ??? flvInfo.needs_key === '1',
          optionalThreadId: '',
            //data.thread.ids.community ? data.thread.ids.default : '', //data.thread.ids.nicos,
            //data.thread.ids.nicos,
          userKey: data.context.userkey,
          hasOwnerThread: data.thread.hasOwnerThread
        };

        const isPlayable = isMp4 && !isSwf && (videoUrl.indexOf('http') === 0);

        cacheStorage.setItem('csrfToken', csrfToken, 30 * 60 * 1000);

        const playlist = {playlist: []};
        data.playlist.items.forEach(item => {
          playlist.playlist.push({
              _format:       'html5playlist',
              _data:          item,
              id:             item.id,
              title:          item.title,
              length_seconds: item.lengthSeconds,
              num_res:        item.numRes,
              mylist_counter: item.mylistCounter,
              view_counter:   item.viewCounter,
              thumbnail_url:  item.thumbnailURL,
              first_retrieve: item.firstRetrieve,
              has_data:      true,
              is_translated: false
          });
        });

        const tagList = [];
        data.tags.forEach(t => {
          tagList.push({
            _data: t,
            id: t.id,
            tag: t.name,
            dic: t.isDictionaryExists,
            lock: t.isLocked
          });
        });
        let channelInfo = null, channelId = null;
        if (data.channel) {
          channelInfo = {
            icon_url:     data.channel.iconURL || '',
            id:           data.channel.id,
            name:         data.channel.name,
            is_favorited: data.channel.isFavorited ? 1 : 0
          };
          channelId = channelInfo.id;
        }
        let uploaderInfo = null;
        if (data.owner) {
          uploaderInfo = {
            icon_url:        data.owner.iconURL,
            id:              data.owner.id,
            nickname:        data.owner.nickname,
            is_favorited:    data.owner.isFavorited,
            isMyVideoPublic: data.owner.isUserMyVideoPublic
          };
        }

        const watchApiData = {
          videoDetail: {
            v:  data.context.watchId,
            id: data.video.id,
            title:                data.video.title,
            title_original:       data.video.originalTitle,
            description:          data.video.description,
            description_original: data.video.originalDescription,
            postedAt:             data.video.postedDateTime,
            thumbnail:            data.video.thumbnailURL,
            length:               data.video.duration,

            width:  data.video.width,
            height: data.video.height,

            isChannel:   data.channel && data.channel.id,
            isMymemory:  data.context.isMyMemory, // 大文字小文字注意
            communityId: data.community ? data.community.id : null,
            channelId,

            commentCount: data.thread.commentCount,
            mylistCount:  data.video.mylistCount,
            viewCount:    data.video.viewCount,

            tagList
          },
          viewerInfo: { id: data.viewer.id },
          channelInfo,
          uploaderInfo
        };

        if (data.context && data.context.ownerNGFilters) {
          const ngtmp = [];
          data.context.ownerNGFilters.forEach((ng) => {
            ngtmp.push(
              encodeURIComponent(ng.source) + '=' + encodeURIComponent(ng.destination));
          });
          flvInfo.ng_up = ngtmp.join('&');
        }

        const result = {
          _format: 'html5watchApi',
          _data: data,
          watchApiData,
          flvInfo,
          dmcInfo,
          msgInfo,
          playlist,
          isPlayable,
          isMp4,
          isFlv,
          isSwf,
          isEco,
          isDmc,
          thumbnail,
          csrfToken,
          watchAuthKey,
          playlistToken
        };


        ZenzaWatch.emitter.emitAsync('csrfTokenUpdate', csrfToken);
        return result;
      };


      var parseWatchApiData = function(src) {
        const dom = document.createElement('div');
        dom.innerHTML = src;
        if (dom.querySelector('#watchAPIDataContainer')) {
          return parseFromGinza(dom);
        } else if (dom.querySelector('#js-initial-watch-data')) {
          return parseFromHtml5Watch(dom);
        } else {
          // TODO: エラー表示
          return new Error('ログインしてない');
        }
      };

      var loadFromWatchApiData = function(watchId, options) {
        var url = '/watch/' + watchId;
        var query = [];
        if (options.economy === true) {
          query.push('eco=1');
        }
        if (query.length > 0) {
          url += '?' + query.join('&');
        }

        console.log('%cloadFromWatchApiData...', 'background: lightgreen;', watchId, url);

        var isFallback = false;
        var onLoad = function(req) {
          var data = parseWatchApiData(req);
          ZenzaWatch.debug.watchApiData = data;

          if (!data) {
            //var $dom = $('<div>' + req + '</div>');
            //var msg = $dom.find('#PAGEBODY .font12').text();
            videoInfoLoader.emitAsync('fail', watchId, {
              message: '動画情報の取得に失敗(watchApi)',
              type: 'watchapi'
            });
            return;
          }

          if (data.isFlv && !isFallback && options.economy !== true) {
            isFallback = true;

            url = url + (query.length > 0 ? '&eco=1' : '?eco=1');
            console.log('%cエコノミーにフォールバック(flv)', 'background: cyan; color: red;', url);
            window.setTimeout(function() {
              ajax({
                url: url,
                xhrFields: { withCredentials: true },
                //beforeSend: function(xhr) {
                //  xhr.setRequestHeader('Referer', 'http://www.nicovideo.jp');
                //},
                headers: {
//                  'Referer': 'http://www.nicovideo.jp/',
                  'X-Alt-Referer': location.protocol + '//www.nicovideo.jp/'
                }
              }).then(
                onLoad,
                function() {
                  videoInfoLoader.emitAsync('fail', watchId, {
                    message: '動画情報の取得に失敗(watchApi)',
                    type: 'watchapi'
                  });
                }
              );
            }, 1000);
          } else if (!data.isPlayable) {
            videoInfoLoader.emitAsync('fail', watchId, {
              message: 'この動画はZenzaWatchで再生できません',
              info: data
            });
          } else if (data.isMp4) {
            videoInfoLoader.emitAsync('load', data, 'WATCH_API', watchId);
            ZenzaWatch.emitter.emitAsync('loadVideoInfo', data, 'WATCH_API', watchId); // 外部連携用
          } else {
            videoInfoLoader.emitAsync('fail', watchId, {
              message: 'この動画はZenzaWatchで再生できません',
              info: data
            });
          }
        };

        ajax({
          url: url,
          xhrFields: { withCredentials: true },
          // referrerによってplaylistの中身が変わるので無難な物にする
          //beforeSend: function(xhr) {
          //  xhr.setRequestHeader('Referer', 'http://www.nicovideo.jp');
          //},
          headers: {
//            'Referer': 'http://www.nicovideo.jp/',
            'X-Alt-Referer': location.protocol + '//www.nicovideo.jp/'
          }
        }).then(
          onLoad,
          function() {
            videoInfoLoader.emitAsync('fail', watchId, {
              message: '動画情報の取得に失敗(watchApi)',
              type: 'watchapi'
            });
          }
        );
      };

      var load = function(watchId, options) {
        if (isLogin()) {
          loadFromWatchApiData(watchId, options);
        } else {
          loadFromThumbWatch(watchId, options);
        }
      };

      _.assign(videoInfoLoader, {
        load: load
      });

      return videoInfoLoader;
    })();



    var ThumbInfoLoader = (function() {
      var BASE_URL = location.protocol + '//ext.nicovideo.jp/';
      var MESSAGE_ORIGIN = location.protocol + '//ext.nicovideo.jp/';
      var gate = null;
      var cacheStorage;

      var parseXml = function(xmlText) {
        var parser = new DOMParser();
        var xml = parser.parseFromString(xmlText, 'text/xml');
        var val = function(name) {
          var elms = xml.getElementsByTagName(name);
          if (elms.length < 1) {
            return null;
          }
          return elms[0].innerHTML;
        };

        var resp = xml.getElementsByTagName('nicovideo_thumb_response');
        if (resp.length < 1 || resp[0].getAttribute('status') !== 'ok') {
          return {
            status: 'fail',
            code: val('code'),
            message: val('description')
          };
        }

        var duration = (function() {
          var tmp = val('length').split(':');
          return parseInt(tmp[0], 10) * 60 + parseInt(tmp[1], 10);
        })();
        var watchId = val('watch_url').split('/').reverse()[0];
        var postedAt = (new Date(val('first_retrieve'))).toLocaleString();
        var tags = (function() {
          var result = [], t = xml.getElementsByTagName('tag');
          _.each(t, function(tag) {
            result.push(tag.innerHTML);
          });
          return result;
        })();

        var result = {
          status: 'ok',
          _format: 'thumbInfo',
          v:     watchId,
          id:    val('video_id'),
          title: val('title'),
          description:  val('description'),
          thumbnail:    val('thumbnail_url'),
          movieType:    val('movie_type'),
          lastResBody:  val('last_res_body'),
          duration:     duration,
          postedAt:     postedAt,
          mylistCount:  parseInt(val('mylist_counter'), 10),
          viewCount:    parseInt(val('view_counter'), 10),
          commentCount: parseInt(val('comment_num'), 10),
          tagList: tags
        };
        var userId = val('user_id');
        if (userId !== null) {
          result.owner = {
            type: 'user',
            id: userId,
            name: val('user_nickname') || '(非公開ユーザー)',
            url:  userId ? ('//www.nicovideo.jp/user/' + userId) : '#',
            icon: val('user_icon_url') || '//res.nimg.jp/img/user/thumb/blank.jpg'
          };
        }
        var channelId  = val('ch_id');
        if (channelId !== null) {
          result.owner = {
            type: 'channel',
            id: channelId,
            name: val('ch_name') || '(非公開ユーザー)',
            url: '//ch.nicovideo.jp/ch' + channelId,
            icon: val('ch_icon_url') || '//res.nimg.jp/img/user/thumb/blank.jpg'
          };
        }
        console.log('thumbinfo: ', watchId, result);

        cacheStorage.setItem('thumbInfo_' + result.v, result);

        return result;
      };

      var initialize = function() {
        initialize = _.noop;
        cacheStorage = new CacheStorage(sessionStorage);
        gate = new CrossDomainGate({
          baseUrl: BASE_URL,
          origin: MESSAGE_ORIGIN,
          type: 'thumbInfo',
          messager: WindowMessageEmitter
        });
      };

      var load = function(watchId) {
        initialize();

        return new Promise(function(resolve, reject) {
          var cache = cacheStorage.getItem('thumbInfo_' + watchId);
          if (cache) {
            console.log('cache exist: ', watchId);
            ZenzaWatch.util.callAsync(function() { resolve(cache); });
            return;
          }

          gate.load(BASE_URL + 'api/getthumbinfo/' + watchId).then(function(result) {
            result = parseXml(result);
            if (result.status === 'ok') {
              resolve(result);
            } else {
              reject(result);
            }
          });
        });
      };

      return {
        load: load
      };
    })();
    ZenzaWatch.api.ThumbInfoLoader = ThumbInfoLoader;
// ZenzaWatch.api.ThumbInfoLoader.load('sm9').then(function() {console.log(true, arguments); }, function() { console.log(false, arguments)});

    var VitaApiLoader = (function() {
      var BASE_URL = location.protocol + '//api.ce.nicovideo.jp/api/v1/system.unixtime'; // このへんのAPIまでSSL化されることはあるか...？
      var MESSAGE_ORIGIN = location.protocol + '//api.ce.nicovideo.jp/';
      var gate = null;
      var cacheStorage;
      var STORAGE_PREFIX = 'vitaApi_';

      var initialize = function() {
        initialize = _.noop;
        cacheStorage = new CacheStorage(sessionStorage);
        gate = new CrossDomainGate({
          baseUrl: BASE_URL,
          origin: MESSAGE_ORIGIN,
          type: 'vitaApi',
          messager: WindowMessageEmitter
        });
      };

      var saveCache = function(videoInfoList) {
        _.each(videoInfoList, function(videoInfo) {
          var videoId = videoInfo.video.id;
          cacheStorage.setItem(STORAGE_PREFIX + videoId, videoInfo);
        });
      };
      var loadCache = function(watchIds) {
        var result = {};
        _.each(watchIds, function(watchId) {
          var videoInfo = cacheStorage.getItem(STORAGE_PREFIX + watchId);
          if (!videoInfo) { return; }
          videoInfo._format = 'vitaApi';
          result[watchId] = videoInfo;
        });
        return result;
      };

      var load = function(watchIds) {
        initialize();
        watchIds = _.isArray(watchIds) ? watchIds : [watchIds];

        var cacheList = {};
        var noChacheWatchIds = _.filter(watchIds, function(watchId) {
          var cache = cacheStorage.getItem(STORAGE_PREFIX + watchId);
          if (cache) {
            cacheList[watchId] = cache;
            return false;
          }
          return true;
        });

        return new Promise(function(resolve, reject) {
          if (watchIds.length < 1) {
            ZenzaWatch.util.callAsync(function() {
              resolve(cacheList);
            });
            return;
          }

          var url = '/nicoapi/v1/video.array?v=' +
            noChacheWatchIds.join(',') + '&__format=json';

          gate.ajax({
            url: url,
            dataType: 'json'
          }).then(function(json) {
            ZenzaWatch.debug.lastVitaApiResult = json;
            var status = json.nicovideo_video_response['@status'];
            if (status === 'ok') {
              var videoInfoList = json.nicovideo_video_response.video_info || [];
              videoInfoList = _.isArray(videoInfoList) ? videoInfoList : [videoInfoList];
              saveCache(videoInfoList);
              resolve(loadCache(watchIds));
            } else {
              reject({
                status: status,
                message: '取得失敗',
                resp: json
              });
            }
          });
        });
      };

      return {
        load: load
      };
    })();
    ZenzaWatch.api.VitaApiLoader = VitaApiLoader;


    var MessageApiLoader = (function() {
      var VERSION_OLD = '20061206';
      var VERSION     = '20090904';

      const LANG_CODE = {
        'en_us': 1,
        'zh_tw': 2
      };

      var MessageApiLoader = function() {
        this.initialize.apply(this, arguments);
      };

      _.assign(MessageApiLoader.prototype, {
        initialize: function() {
          this._threadKeys = {};
        },
        /**
         * 動画の長さに応じて取得するコメント数を変える
         * 本家よりちょっと盛ってる
         */
        getRequestCountByDuration: function(duration) {
          if (duration < 60)  { return 100; }
          if (duration < 240) { return 200; }
          if (duration < 300) { return 400; }
          return 1000;
        },
        getThreadKey: function(threadId, language) {
          // memo:
          // //flapi.nicovideo.jp/api/getthreadkey?thread={optionalじゃないほうのID}
          var url =
            '//flapi.nicovideo.jp/api/getthreadkey?thread=' + threadId;
          const langCode = this.getLangCode(language);
          if (langCode) { url += `&language_id=${langCode}`; }

          return new Promise((resolve, reject) => {
            ajax({
              url: url,
              contentType: 'text/plain',
              crossDomain: true,
              cache: false,
              xhrFields: {
                withCredentials: true
              }
            }).then((e) => {
              var result = ZenzaWatch.util.parseQuery(e);
              this._threadKeys[threadId] = result;
              resolve(result);
            }, (result) => {
              //PopupMessage.alert('ThreadKeyの取得失敗 ' + threadId);
              reject({
                result: result,
                message: 'ThreadKeyの取得失敗 ' + threadId
              });
            });
          });
        },
        getLangCode: function(language) {
          language = language.replace('-', '_').toLowerCase();
          if (LANG_CODE[language]) {
            return LANG_CODE[language];
          }
          return 0;
        },
        getPostKey: function(threadId, blockNo, language) {
          // memo:
          // //flapi.nicovideo.jp/api/getthreadkey?thread={optionalじゃないほうのID}
          //flapi.nicovideo.jp/api/getpostkey/?device=1&thread=1111&version=1&version_sub=2&block_no=0&yugi=
          var url =
            '//flapi.nicovideo.jp/api/getpostkey?device=1&thread=' + threadId +
            '&block_no=' + blockNo +
            '&version=1&version_sub=2&yugi=' +
  //          '&language_id=0';
            '';
          //const langCode = this.getLangCode(language);
          //if (langCode) { url += `&language_id=${langCode}`; }

          console.log('getPostkey url: ', url);
          return new Promise((resolve, reject) => {
            ajax({
              url: url,
              contentType: 'text/plain',
              crossDomain: true,
              cache: false,
              xhrFields: {
                withCredentials: true
              }
            }).then((e) => {
              resolve(ZenzaWatch.util.parseQuery(e));
            }, (result) => {
              //PopupMessage.alert('ThreadKeyの取得失敗 ' + threadId);
              reject({
                result: result,
                message: 'PostKeyの取得失敗 ' + threadId
              });
            });
          });
        },
        _createThreadXml:
          function(params) { //msgInfo, version, threadKey, force184, duration, userKey) {
          const threadId         =
            params.isOptional ? params.msgInfo.optionalThreadId : params.msgInfo.threadId;
          const duration         = params.msgInfo.duration;
          const userId           = params.msgInfo.userId;
          //const optionalThreadId = msgInfo.optionalThreadId;
          const userKey          = params.msgInfo.userKey;
          const threadKey        = params.threadKey;
          const force184         = params.force184;
          const version          = params.version;

          const thread = document.createElement('thread');
          thread.setAttribute('thread', threadId);
          thread.setAttribute('version', version);
          if (params.useUserKey) {
            thread.setAttribute('userkey', userKey);
          }
          if (params.useDuration) {
            //const resCount = this.getRequestCountByDuration(duration);
            thread.setAttribute('click_revision', '-1');
            thread.setAttribute('res_from', '-1000');
            thread.setAttribute('fork', '1');
          }
          //if (params.msgInfo.hasOwnerThread && !params.isOptional) {
          //}
          if (typeof userId !== 'undefined') {
            thread.setAttribute('user_id', userId);
          }
          if (params.useThreadKey && typeof threadKey !== 'undefined') {
            thread.setAttribute('threadkey', threadKey);
          }
          if (params.useThreadKey && typeof force184 !== 'undefined') {
            thread.setAttribute('force_184', force184);
          }
          thread.setAttribute('scores', '1');
          thread.setAttribute('nicoru', '1');
          thread.setAttribute('with_global', '1');

          const langCode = this.getLangCode(params.msgInfo.language);
          if (langCode) { thread.setAttribute('language', langCode); }

          return thread;
        },
        _createThreadLeavesXml:
          //function(threadId, version, userId, threadKey, force184, duration, userKey) {
          function(params) {//msgInfo, version, threadKey, force184, userKey) {
          const threadId         =
            params.isOptional ? params.msgInfo.optionalThreadId : params.msgInfo.threadId;
          const duration         = params.msgInfo.duration;
          const userId           = params.msgInfo.userId;
          const userKey          = params.msgInfo.userKey;
          const threadKey        = params.threadKey;
          const force184         = params.force184;

          const thread_leaves = document.createElement('thread_leaves');
          const resCount = this.getRequestCountByDuration(duration);
          const threadLeavesParam =
            ['0-', (Math.floor(duration / 60) + 1), ':100,', resCount].join('');
          thread_leaves.setAttribute('thread', threadId);
          if (params.useUserKey) {
            thread_leaves.setAttribute('userkey', userKey);
          }
          if (typeof userId !== 'undefined') {
            thread_leaves.setAttribute('user_id', userId);
          }
          if (typeof threadKey !== 'undefined') {
            thread_leaves.setAttribute('threadkey', threadKey);
          }
          if (typeof force184 !== 'undefined') {
            thread_leaves.setAttribute('force_184', force184);
          }
          thread_leaves.setAttribute('scores', '1');
          thread_leaves.setAttribute('nicoru', '1');

          const langCode = this.getLangCode(params.msgInfo.language);
          if (langCode) { thread_leaves.setAttribute('language', langCode); }

          thread_leaves.innerHTML = threadLeavesParam;

          return thread_leaves;
        },

        //buildPacket: function(threadId, duration, userId, threadKey, force184, optionalThreadId, userKey)
        buildPacket: function(msgInfo, threadKey, force184)
        {
          //const duration = msgInfo.duration;

          const span   = document.createElement('span');
          const packet = document.createElement('packet');

          // リクエスト用のxml生成なのだが闇が深い
          // 不要なところにdurationやuserKeyを渡すとコメントが取得できなくなったりする
          // 不要なら無視してくれればいいのに
          // 本当よくわからないので困る
          if (msgInfo.optionalThreadId) {
            packet.appendChild(
              this._createThreadXml({
                msgInfo: msgInfo,
                version: VERSION,
                useDuration: false,
                useUserKey: true,
                useThreadKey: false,
                isOptional: true
              })
            );
            packet.appendChild(
              this._createThreadLeavesXml({
                msgInfo: msgInfo,
                version: VERSION,
                useUserKey: true,
                useThreadKey: false,
                isOptional: true
               })
            );
          } else {
            // forkを取得するには必要っぽい
            packet.appendChild(
              this._createThreadXml({
                msgInfo: msgInfo,
                version: VERSION_OLD,
                threadKey: threadKey,
                force184: force184,
                useDuration: true,
                useThreadKey: false,
                useUserKey: false
              })
            );
          }
            packet.appendChild(
            this._createThreadXml({
              msgInfo: msgInfo,
              version: VERSION,
              threadKey: threadKey,
              force184: force184,
              useDuration: false,
              useThreadKey: true,
              useUserKey: false
            })
          );
          packet.appendChild(
            this._createThreadLeavesXml({
              msgInfo: msgInfo,
              version: VERSION,
              threadKey: threadKey,
              force184: force184,
              useThreadKey: true,
              useUserKey: false
            })
          );
          

          span.appendChild(packet);
          var packetXml = span.innerHTML;

          return packetXml;
        },
        _post: function(server, xml) {
          // マイページのjQueryが古いためかおかしな挙動をするのでPromiseで囲う
          var isNmsg = server.indexOf('nmsg.nicovideo.jp') >= 0;
          return new Promise((resolve, reject) => {
            ajax({
              url: server,
              data: xml,
              timeout: 60000,
              type: 'POST',
              contentType: isNmsg ? 'text/xml' : 'text/plain',
              dataType: 'xml',
              crossDomain: true,
              cache: false
            }).then((result) => {
              //console.log('post success: ', result);
              resolve(result);
            }, (result) => {
              //console.log('post fail: ', result);
              reject({
                result: result,
                message: 'コメントの通信失敗 server: ' + server
              });
            });
          });
        },
        _get: function(server, threadId, duration, threadKey, force184) {
          // nmsg.nicovideo.jpでググったら出てきた。
          // http://favstar.fm/users/koizuka/status/23032783744012288
          // xmlじゃなくてもいいのかよ!

          var resCount = this.getRequestCountByDuration(duration);

          var url = server +
            'thread?version=' + VERSION +
            '&thread=' + threadId +
            '&scores=1' +
            '&res_from=-' + resCount;
          if (threadKey) {
            url += '&threadkey=' + threadKey;
          }
          if (force184) {
            url += '&force_184=' + force184;
          }

          console.log('%cthread url:', 'background: cyan;', url);
          return new Promise((resolve, reject) => {
            ajax({
              url: url,
              timeout: 60000,
              crossDomain: true,
              cache: false
            }).then(function(result) {
              //console.log('post success: ', result);
              resolve(result);
            }, function(result) {
              //console.log('post fail: ', result);
              reject({
                result: result,
                message: 'コメントの取得失敗' + server
              });
            });
          });
        },
        _load: function(msgInfo) {
          var packet;
          if (msgInfo.isNeedKey) {
            return this.getThreadKey(msgInfo.threadId, msgInfo.language).then((info) => {
              console.log('threadkey: ', info);
              packet = this.buildPacket(msgInfo, info.threadkey, info.force_184);

              console.log('post xml...', msgInfo.server, packet);
              //get(server, threadId, duration, info.threadkey, info.force_184);
              return this._post(msgInfo.server, packet, msgInfo.threadId);
            });
          } else {
            packet = this.buildPacket(msgInfo);

            console.log('post xml...', msgInfo.server, packet);
            return this._post(msgInfo.server, packet, msgInfo.threadId);
          }
        },
        load: function(msgInfo) {
          const server           = msgInfo.server;
          const threadId         = msgInfo.threadId;
          const userId           = msgInfo.userId;

          const timeKey = `loadComment server: ${server} thread: ${threadId}`;
          window.console.time(timeKey);

          var resolve, reject;
          const onSuccess = (result) => {
            window.console.timeEnd(timeKey);
            ZenzaWatch.debug.lastMessageServerResult = result;

            var thread, xml, ticket, lastRes = 0;
            var resultCodes = [], resultCode = null;
            try {
              xml = result.documentElement;
              var threads = xml.getElementsByTagName('thread');
              //chats = xml.getElementsByTagName('chat');

              thread = threads[0];
              //_.each(threads, function(t) {
              //  var tk = t.getAttribute('ticket');
              //  if (tk && tk !== '0') { ticket = tk; }
              //  var lr = t.getAttribute('last_res');
              //  if (!isNaN(lr)) { lastRes = Math.max(lastRes, lr); }
              //});
              
              _.each(threads, function(t) {
                var tid = t.getAttribute('thread');
                //window.console.log(t, t.outerHTML);
                if (parseInt(tid, 10) === parseInt(threadId, 10)) {
                  thread = t;
                  return false;
                }
              });
              // どのthreadを参照すればいいのか仕様がわからない。
              // しかたないので総当たり
              _.each(threads, function(t) {

                var rc = t.getAttribute('resultcode');
                if (rc.length) {
                  resultCodes.push(parseInt(rc, 10));
                }

                var tid = t.getAttribute('thread');
                //window.console.log(t, t.outerHTML);
                if (parseInt(tid, 10) === parseInt(threadId, 10)) {
                  thread = t;
                  const tk = thread.getAttribute('ticket');
                  if (tk && tk !== '0') { ticket = tk; }
                }
              });

               //const tk = thread.getAttribute('ticket');
              //if (tk && tk !== '0') { ticket = tk; }
              const lr = thread.getAttribute('last_res');
              if (!isNaN(lr)) { lastRes = Math.max(lastRes, lr); }

              //resultCode = thread.getAttribute('resultcode');
              resultCode = (resultCodes.sort())[0];
            } catch (e) {
              console.error(e);
            }

            //if (resultCode !== '0' && (!chats || chats.length < 1)) {
            window.console.log('resultCodes: ', resultCodes);
            if (resultCode !== 0) {
              reject({
                message: `コメント取得失敗[${resultCodes.join(', ')}]`
              });
              return;
            }

            var threadInfo = {
              server:     server,
              userId:     userId,
              resultCode: resultCode,
              threadId:   threadId,
              thread:     thread.getAttribute('thread'),
              serverTime: thread.getAttribute('server_time'),
              lastRes:    lastRes,
              blockNo:    Math.floor((lastRes * 1 + 1) / 100),
              ticket:     ticket,
              revision:   thread.getAttribute('revision')
            };

            if (this._threadKeys[threadId]) {
              threadInfo.threadKey = this._threadKeys[threadId].threadkey;
              threadInfo.force184  = this._threadKeys[threadId].force_184;
            }

            window.console.log('threadInfo: ', threadInfo);
            resolve({
              resultCode: resultCode,
              threadInfo: threadInfo,
              xml: xml
            });
          };

          const onFailFinally = (e) => {
            window.console.timeEnd(timeKey);
            window.console.error('loadComment fail: ', e);
            reject({
              message: 'コメントサーバーの通信失敗: ' + server
            });
          };

          const onFail1st = (e) => {
            window.console.timeEnd(timeKey);
            window.console.error('loadComment fail: ', e);
            PopupMessage.alert('コメントの取得失敗: 3秒後にリトライ');

            window.setTimeout(() => {
              this._load(msgInfo).then(onSuccess, onFailFinally);
            }, 3000);
          };


          return new Promise((res, rej) => {
            resolve = res;
            reject  = rej;
            this._load(msgInfo).then(onSuccess, onFail1st);
          });
        },
        _postChat: function(threadInfo, postKey, text, cmd, vpos) {
          const div = document.createElement('div');
          const chat = document.createElement('chat');
          chat.setAttribute('premium', ZenzaWatch.util.isPremium() ? '1' : '0');
          chat.setAttribute('postkey', postKey);
          chat.setAttribute('user_id', threadInfo.userId);
          chat.setAttribute('ticket',  threadInfo.ticket);
          chat.setAttribute('thread',  threadInfo.thread);
          chat.setAttribute('mail',    cmd);
          chat.setAttribute('vpos',    vpos);
          chat.innerHTML = text;
          div.appendChild(chat);
          var xml = div.innerHTML;

          window.console.log('post xml: ', xml);
          return this._post(threadInfo.server, xml).then((result) => {
            var status = null, chat_result, no = 0, blockNo = 0, xml;
            try {
              xml = result.documentElement;
              chat_result = xml.getElementsByTagName('chat_result')[0];
              status = chat_result.getAttribute('status');
              no = parseInt(chat_result.getAttribute('no'), 10);
              blockNo = Math.floor((no + 1) / 100);
            } catch (e) {
              console.error(e);
            }

            if (status !== '0') {
              return Promise.reject({
                status: 'fail',
                no: no,
                blockNo: blockNo,
                code: status,
                message: 'コメント投稿失敗 status: ' + status + ' server: ' + threadInfo.server
              });
            }

            return Promise.resolve({
              status: 'ok',
              no: no,
              blockNo: blockNo,
              code: status,
              message: 'コメント投稿成功'
            });
          });
        },
        postChat: function(threadInfo, text, cmd, vpos, language) {
          return this.getPostKey(threadInfo.threadId, threadInfo.blockNo, language)
            .then((result) => {
            return this._postChat(threadInfo, result.postkey, text, cmd, vpos);
          });
        }
      });

      return MessageApiLoader;
    })();
    ZenzaWatch.api.MessageApiLoader = MessageApiLoader;

    var MylistApiLoader = (function() {
      // マイリスト/とりあえずマイリストの取得APIには
      // www.nicovideo.jp配下とriapi.nicovideo.jp配下の２種類がある
      // 他人のマイリストを取得するにはriapi、マイリストの編集にはwwwのapiが必要
      // データのフォーマットが微妙に異なるのでめんどくさい
      //
      // おかげでソート処理が悲しいことに
      //
      var CACHE_EXPIRE_TIME = Config.getValue('debug') ? 10000 : 5 * 60 * 1000;
      var TOKEN_EXPIRE_TIME = 59 * 60 * 1000;
      var token = '';
      var cacheStorage = null;

      function MylistApiLoader() {
        this.initialize.apply(this, arguments);
      }

      ZenzaWatch.emitter.on('csrfTokenUpdate', function(t) {
        token = t;
        if (cacheStorage) {
          cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
        }
      });

      _.assign(MylistApiLoader.prototype, {
        initialize: function() {
          if (!cacheStorage) {
            cacheStorage = new CacheStorage(sessionStorage);
          }
          if (!token) {
            token = cacheStorage.getItem('csrfToken');
            if (token) { console.log('cached token exists', token); }
          }
        },
        setCsrfToken: function(t) {
          token = t;
          if (cacheStorage) {
            cacheStorage.setItem('csrfToken', token, TOKEN_EXPIRE_TIME);
          }
        },
        getDeflistItems: function(options) {
          options = options || {};
          var url = '//www.nicovideo.jp/api/deflist/list';
          //var url = 'http://riapi.nicovideo.jp/api/watch/deflistvideo';
          var cacheKey = 'deflistItems';
          var sortItem = this.sortItem;
          options = options || {};

          return new Promise(function(resolve, reject) {

            var cacheData = cacheStorage.getItem(cacheKey);
            if (cacheData) {
              console.log('cache exists: ', cacheKey, cacheData);
              ZenzaWatch.util.callAsync(function() {
                if (options.sort) { cacheData = sortItem(cacheData, options.sort, 'www'); }
                resolve(cacheData);
              }, this);
              return;
            }

            ajax({
              url: url,
              timeout: 60000,
              cache: false,
              dataType: 'json',
              xhrFields: { withCredentials: true }
            }).then(function(result) {
              if (result.status !== 'ok' || (!result.list && !result.mylistitem)) {
                reject({
                  result: result,
                  message: 'とりあえずマイリストの取得失敗(1)'
                });
                return;
              }

              var data = result.list || result.mylistitem;
              cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
              if (options.sort) { data = sortItem(data, options.sort, 'www'); }
              resolve(data);
            }, function(err) {
              reject({
                result: err,
                message: 'とりあえずマイリストの取得失敗(2)'
              });
            });
          });
        },
        getMylistItems: function(groupId, options) {
          options = options || {};
          if (groupId === 'deflist') { return this.getDeflistItems(options); }
          // riapiじゃないと自分のマイリストしか取れないことが発覚
          var url = '//riapi.nicovideo.jp/api/watch/mylistvideo?id=' + groupId;
          var cacheKey = 'mylistItems: ' + groupId;
          var sortItem = this.sortItem;

          return new Promise(function(resolve, reject) {

            var cacheData = cacheStorage.getItem(cacheKey);
            if (cacheData) {
              console.log('cache exists: ', cacheKey, cacheData);
              ZenzaWatch.util.callAsync(function() {
                if (options.sort) { cacheData = sortItem(cacheData, options.sort, 'riapi'); }
                resolve(cacheData);
              }, this);
              return;
            }

            return ajax({
              url: url,
              timeout: 60000,
              cache: false,
              dataType: 'json',
              xhrFields: { withCredentials: true }
            }).then(function(result) {
              if (result.status !== 'ok' || (!result.list && !result.mylistitem)) {
                return reject({
                  result: result,
                  message: 'マイリストの取得失敗(1)'
                });
              }

              var data = result.list || result.mylistitem;
              cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
              if (options.sort) { data = sortItem(data, options.sort, 'riapi'); }
              return resolve(data);
            }, function(err) {
              this.reject({
                result: err,
                message: 'マイリストの取得失敗(2)'
              });
            });
          });
        },
        sortItem: function(items, sortId, format) {
          // wwwの時とriapiの時で微妙にフォーマットが違うのでめんどくさい
          // 自分以外のマイリストが開けるのはriapiだけの模様
          // 編集時にはitem_idが必要なのだが、それはwwwのほうにしか入ってない
          // riapiに統一したい
          sortId = parseInt(sortId, 10);

          var sortKey = ([
            'create_time',    'create_time',
            'mylist_comment', 'mylist_comment', // format = wwwの時はdescription
            'title',          'title',
            'first_retrieve', 'first_retrieve',
            'view_counter',   'view_counter',
            'thread_update_time', 'thread_update_time',
            'num_res',        'num_res',
            'mylist_counter', 'mylist_counter',
            'length_seconds', 'length_seconds'
          ])[sortId];

          if (format === 'www' && sortKey === 'mylist_comment') {
            sortKey = 'description';
          }
          if (format === 'www' && sortKey === 'thread_update_time') {
            sortKey = 'update_time';
          }

          var order;
          switch (sortKey) {
            // 偶数がascで奇数がdescかと思ったら特に統一されてなかった
            case 'first_retrieve':
            case 'thread_update_time':
            case 'update_time':
              order = (sortId % 2 === 1) ? 'asc' : 'desc';
              break;
            // 数値系は偶数がdesc
            case 'num_res':
            case 'mylist_counter':
            case 'view_counter':
            case 'length_seconds':
              order = (sortId % 2 === 1) ? 'asc' : 'desc';
              break;
            default:
              order = (sortId % 2 === 0) ? 'asc' : 'desc';
          }

          //window.console.log('sortKey?', sortId, sortKey, order);
          if (!sortKey) { return items; }

          var getKeyFunc = (function(sortKey, format) {
            switch (sortKey) {
              case 'create_time':
              case 'description':
              case 'mylist_comment':
              case 'update_time':
                return function(item) { return item[sortKey]; };
              case 'num_res':
              case 'mylist_counter':
              case 'view_counter':
              case 'length_seconds':
                if (format === 'riapi') {
                  return function(item) { return item[sortKey] * 1; };
                } else {
                  return function(item) { return item.item_data[sortKey] * 1; };
                }
                break;
              default:
                if (format === 'riapi') {
                  return function(item) { return item[sortKey]; };
                } else {
                  return function(item) { return item.item_data[sortKey]; };
                }
            }
          })(sortKey, format);

          var compareFunc = (function(order, getKey) {
            switch (order) {
              // sortKeyが同一だった場合は動画IDでソートする
              // 銀魂など、一部公式チャンネル動画向けの対応
              case 'asc':
                return function(a, b) {
                  var ak = getKey(a), bk = getKey(b);
                  if (ak !== bk) { return ak > bk ? 1 : -1; }
                  //else { return a.item_data.watch_id > b.item_data.watch_id ? 1 : -1; }
                  else { return a.id > b.id ? 1 : -1; }
                };
              case 'desc':
                return function(a, b) {
                  var ak = getKey(a), bk = getKey(b);
                  if (ak !== bk) { return (ak < bk) ? 1 : -1; }
                  else { return a.id < b.id ? 1 : -1; }
                };
            }
          })(order, getKeyFunc);

          //window.console.log('before sort', items[0], items, order, sortKey, compareFunc);
          items.sort(compareFunc);
          //window.console.log('after sort', items[0], items);
          return items;
        },
        getMylistList: function() {
          var url = '//www.nicovideo.jp/api/mylistgroup/list';
          var cacheKey = 'mylistList';

          return new Promise(function(resolve, reject) {

            var cacheData = cacheStorage.getItem(cacheKey);
            if (cacheData) {
              console.log('cache exists: ', cacheKey, cacheData);
              ZenzaWatch.util.callAsync(function() { resolve(cacheData); });
              return;
            }

            ajax({
              url: url,
              timeout: 60000,
              cache: false,
              dataType: 'json',
              xhrFields: { withCredentials: true }
              }).then(function(result) {
                if (result.status !== 'ok' || !result.mylistgroup) {
                  return reject({
                    result: result,
                    message: 'マイリスト一覧の取得失敗(1)'
                  });
                }

                var data = result.mylistgroup;
                cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
                return resolve(data);
              }, function(err) {
                return reject({
                  result: err,
                  message: 'マイリスト一覧の取得失敗(2)'
                });
              });
          });
        },
        findDeflistItemByWatchId: function(watchId) {
          return this.getDeflistItems().then(function(items) {
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i], wid = item.id || item.item_data.watch_id;
              if (wid === watchId) {
                return Promise.resolve(item);
              }
            }
            return Promise.reject();
          });
        },
        findMylistItemByWatchId: function(watchId, groupId) {
          return this._getMylistItemsFromWapi(groupId).then(function(items) {
            for (var i = 0, len = items.length; i < len; i++) {
              var item = items[i], wid = item.id || item.item_data.watch_id;
              if (wid === watchId) {
                return Promise.resolve(item);
              }
            }
            return Promise.reject();
          });
        },
        _getMylistItemsFromWapi: function(groupId) {
          // めんどくさいが、マイリスト取得APIは2種類ある
          // こっちは自分のマイリストだけを取る奴。 編集にはこっちが必要。
          var url = '//www.nicovideo.jp/api/mylist/list?group_id=' + groupId;
          return ajax({
            url: url,
            timeout: 60000,
            cache: false,
            dataType: 'json',
            xhrFields: { withCredentials: true }
          }).then(function(result) {
            if (result.status === 'ok' && result.mylistitem) {
              return Promise.resolve(result.mylistitem);
            }
            return Promise.reject();
          });
        },
        removeDeflistItem: function(watchId) {
          return this.findDeflistItemByWatchId(watchId).then(function(item) {
            var url = '//www.nicovideo.jp/api/deflist/delete';
            var data = 'id_list[0][]=' + item.item_id + '&token=' + token;
            var cacheKey = 'deflistItems';
            var req = {
              url: url,
              method: 'POST',
              data: data,
              dataType: 'json',
              headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            };

            return ajax(req).then(function(result) {
              if (result.status && result.status === 'ok') {
                cacheStorage.removeItem(cacheKey);
                ZenzaWatch.emitter.emitAsync('deflistRemove', watchId);
                return Promise.resolve({
                  status: 'ok',
                  result: result,
                  message: 'とりあえずマイリストから削除'
                });
              }

              return Promise.reject({
                status: 'fail',
                result: result,
                code: result.error.code,
                message: result.error.description
              });

            }, function(err) {
              return Promise.reject({
                result: err,
                message: 'とりあえずマイリストから削除失敗(2)'
              });
            });

          }, function(err) {
            return Promise.reject({
              status: 'fail',
              result: err,
              message: '動画が見つかりません'
            });
          });
        },
        removeMylistItem: function(watchId, groupId) {
          return this.findMylistItemByWatchId(watchId, groupId).then(function(item) {
            var url = '//www.nicovideo.jp/api/mylist/delete';
            window.console.log('delete item:', item);
            var data = 'id_list[0][]=' + item.item_id + '&token=' + token + '&group_id=' + groupId;
            var cacheKey = 'mylistItems: ' + groupId;
            var req = {
              url: url,
              method: 'POST',
              data: data,
              dataType: 'json',
              headers: {'Content-Type': 'application/x-www-form-urlencoded'},
            };

            return ajax(req).then(function(result) {
              if (result.status && result.status === 'ok') {
                cacheStorage.removeItem(cacheKey);
                ZenzaWatch.emitter.emitAsync('mylistRemove', watchId, groupId);
                return Promise.resolve({
                  status: 'ok',
                  result: result,
                  message: 'マイリストから削除'
                });
              }

              return Promise.reject({
                status: 'fail',
                result: result,
                code: result.error.code,
                message: result.error.description
              });

            }, function(err) {
              return Promise.reject({
                result: err,
                message: 'マイリストから削除失敗(2)'
              });
            });

          }, function(err) {
            window.console.error(err);
            return Promise.reject({
              status: 'fail',
              result: err,
              message: '動画が見つかりません'
            });
          });
         },
        _addDeflistItem: function(watchId, description, isRetry) {
          var url = '//www.nicovideo.jp/api/deflist/add';
          var data = 'item_id=' + watchId + '&token=' + token;
          if (description) {
            data += '&description='+ encodeURIComponent(description);
          }
          var cacheKey = 'deflistItems';

          var req = {
            url: url,
            method: 'POST',
            data: data,
            dataType: 'json',
            timeout: 60000,
            xhrFields: { withCredentials: true },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          };

          var self = this;
          return new Promise(function(resolve, reject) {
            ajax(req).then(function(result) {
              if (result.status && result.status === 'ok') {
                cacheStorage.removeItem(cacheKey);
                ZenzaWatch.emitter.emitAsync('deflistAdd', watchId, description);
                return resolve({
                  status: 'ok',
                  result: result,
                  message: 'とりあえずマイリスト登録'
                });
              }

              if (!result.status || !result.error) {
                return reject({
                  status: 'fail',
                  result: result,
                  message: 'とりあえずマイリスト登録失敗(100)'
                });
              }

              if (result.error.code !== 'EXIST' || isRetry) {
                return reject({
                  status: 'fail',
                  result: result,
                  code: result.error.code,
                  message: result.error.description
                });
              }

              /**
               すでに登録されている場合は、いったん削除して再度追加(先頭に移動)
               例えば、とりマイの300番目に登録済みだった場合に「登録済みです」と言われても探すのがダルいし、
               他の動画を追加していけば、そのうち押し出されて消えてしまう。
               なので、重複時にエラーを出すのではなく、「消してから追加」することによって先頭に持ってくる。
              */
              return self.removeDeflistItem(watchId).then(function() {
                return self._addDeflistItem(watchId, description, true).then(function(result) {
                  resolve({
                    status: 'ok',
                    result: result,
                    message: 'とりあえずマイリストの先頭に移動'
                  });
                });
              }, function(err) {
                reject({
                  status: 'fail',
                  result: err.result,
                  code:   err.code,
                  message: 'とりあえずマイリスト登録失敗(101)'
                });
              });

            }, function(err) {
              reject({
                status: 'fail',
                result: err,
                message: 'とりあえずマイリスト登録失敗(200)'
              });
            });
          });
        },
        addDeflistItem: function(watchId, description) {
          return this._addDeflistItem(watchId, description, false);
        },
        addMylistItem: function(watchId, groupId, description) {
          var url = '//www.nicovideo.jp/api/mylist/add';
          var data = 'item_id=' + watchId + '&token=' + token + '&group_id=' + groupId;
          if (description) {
            data += '&description='+ encodeURIComponent(description);
          }
          var cacheKey = 'mylistItems: ' + groupId;

          var req = {
            url: url,
            method: 'POST',
            data: data,
            dataType: 'json',
            timeout: 60000,
            xhrFields: { withCredentials: true },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          };

          var self = this;
          return new Promise(function(resolve, reject) {
            ajax(req).then(function(result) {
              if (result.status && result.status === 'ok') {
                cacheStorage.removeItem(cacheKey);
                // マイリストに登録したらとりあえずマイリストから除去(=移動)
                self.removeDeflistItem(watchId).then(_.noop, _.noop);
                return resolve({
                  status: 'ok',
                  result: result,
                  message: 'マイリスト登録'
                });
              }

              if (!result.status || !result.error) {
                return reject({
                  status: 'fail',
                  result: result,
                  message: 'マイリスト登録失敗(100)'
                });
              }

              // マイリストの場合は重複があっても「追加して削除」しない。
              // とりまいと違って押し出されることがないし、
              // シリーズ物が勝手に入れ替わっても困るため

              ZenzaWatch.emitter.emitAsync('mylistAdd', watchId, groupId, description);
              return reject({
                status: 'fail',
                result: result,
                code: result.error.code,
                message: result.error.description
              });
            }, function(err) {
              reject({
                status: 'fail',
                result: err,
                message: 'マイリスト登録失敗(200)'
              });
            });
          });
        }
      });

      return MylistApiLoader;
    })();
    ZenzaWatch.api.MylistApiLoader = MylistApiLoader;
    ZenzaWatch.init.mylistApiLoader = new MylistApiLoader();
//    window.mmm = ZenzaWatch.init.mylistApiLoader;
//
    var UploadedVideoApiLoader = (function() {
      var CACHE_EXPIRE_TIME = Config.getValue('debug') ? 10000 : 5 * 60 * 1000;
      var cacheStorage = null;

      function UploadedVideoApiLoader() {
        this.initialize.apply(this, arguments);
      }
      _.assign(UploadedVideoApiLoader.prototype, {
        initialize: function() {
          if (!cacheStorage) {
            cacheStorage = new CacheStorage(sessionStorage);
          }
        },
        getUploadedVideos: function(userId, options) {
          var url = '//riapi.nicovideo.jp/api/watch/uploadedvideo?user_id=' + userId;
          var cacheKey = 'uploadedvideo: ' + userId;

          return new Promise(function(resolve, reject) {

            var cacheData = cacheStorage.getItem(cacheKey);
            if (cacheData) {
              console.log('cache exists: ', cacheKey, cacheData);
              ZenzaWatch.util.callAsync(function() {
                resolve(cacheData);
              }, this);
              return;
            }

            return ajax({
              url: url,
              timeout: 60000,
              cache: false,
              dataType: 'json',
              xhrFields: { withCredentials: true }
            }).then(function(result) {
              if (result.status !== 'ok' || !result.list) {
                return reject({
                  result: result,
                  message: result.message
                });
              }

              var data = result.list;
              cacheStorage.setItem(cacheKey, data, CACHE_EXPIRE_TIME);
              return resolve(data);
            }, function(err) {
              this.reject({
                result: err,
                message: '動画一覧の取得失敗(2)'
              });
            });
          });
        },
      });
      return UploadedVideoApiLoader;
    })();
    ZenzaWatch.api.UploadedVideoApiLoader = UploadedVideoApiLoader;
    ZenzaWatch.init.UploadedVideoApiLoader = new UploadedVideoApiLoader();
//    window.uuu = ZenzaWatch.init.mylistApiLoader;


    var CrossDomainGate = function() { this.initialize.apply(this, arguments); };
    _.extend(CrossDomainGate.prototype, AsyncEmitter.prototype);
    _.assign(CrossDomainGate.prototype, {
      initialize: function(params) {
        this._baseUrl  = params.baseUrl;
        this._origin   = params.origin || location.href;
        this._type     = params.type;
        this._messager = params.messager || WindowMessageEmitter;

        this._loaderFrame = null;
        this._sessions = {};
        this._initializeStatus = '';
      },
      _initializeFrame: function() {
        var self = this;
        switch (this._initializeStatus) {
          case 'done':
            return new Promise(function(resolve) {
              ZenzaWatch.util.callAsync(function() {
                resolve();
              });
            });
          case 'initializing':
            return new Promise(function(resolve, reject) {
              self.on('initialize', function(e) {
                if (e.status === 'ok') { resolve(); } else { reject(e); }
              });
            });
          case '':
            this._initializeStatus = 'initializing';
            var initialPromise = new Promise(function(resolve, reject) {
              self._sessions.initial = {
                promise: initialPromise,
                resolve: resolve,
                reject: reject
              };
              window.setTimeout(function() {
                if (self._initializeStatus !== 'done') {
                  var rej = {
                    status: 'fail',
                    message: 'CrossDomainGate初期化タイムアウト (' + self._type + ')'
                  };
                  reject(rej);
                  self.emit('initialize', rej);
                }
              }, 60 * 1000);
              self._initializeCrossDomainGate();

            });
          return initialPromise;
        }
      },
      _initializeCrossDomainGate: function() {
        this._initializeCrossDomainGate = _.noop;
        this._messager.on('onMessage', _.bind(this._onMessage, this));

        console.log('%c initialize ' + this._type, 'background: lightgreen;');

        var loaderFrame = document.createElement('iframe');
        loaderFrame.name = this._type + 'Loader';
        //loaderFrame.src  = this._baseUrl;
        loaderFrame.className = 'xDomainLoaderFrame ' + this._type;
        document.body.appendChild(loaderFrame);

        this._loaderFrame = loaderFrame;
        this._loaderWindow = loaderFrame.contentWindow;
        this._messager.addKnownSource(this._loaderWindow);
        this._loaderWindow.location.href = this._baseUrl + '#' + TOKEN;
      },
      _onMessage: function(data, type) {
        if (type !== this._type) {
          //window.console.info('invalid type', type, this._type, data);
          return;
        }
        var info      = data.message;
        var token     = info.token;
        var sessionId = info.sessionId;
        var status    = info.status;
        var command   = info.command || 'loadUrl';
        var session   = this._sessions[sessionId];

        if (status === 'initialized') {
          //window.console.log(type + ' initialized');
          this._initializeStatus = 'done';
          this._sessions.initial.resolve();
          this.emitAsync('initialize', {status: 'ok'});
          return;
        }

        if (token !== TOKEN) {
          window.console.log('invalid token:', token, TOKEN);
          return;
        }

        switch (command) {
          case 'dumpConfig':
            this._onDumpConfig(info.body);
            break;

          default:
            if (!session) { return; }
            if (status === 'ok') { session.resolve(info.body); }
            else { session.reject({ message: status }); }
            session = null;
            delete this._sessions[sessionId];
            break;
        }
      },
      load: function(url, options) {
        return this._postMessage({
          command: 'loadUrl',
          url: url,
          options: options
        }, true);
      },
      ajax: function(options) {
        var url = options.url;
        return this.load(url, options).then(function(result) {
          //window.console.log('xDomain ajax result', result);
          ZenzaWatch.debug.lastCrossDomainAjaxResult = result;
          try {
            var dataType = (options.dataType || '').toLowerCase();
            switch (dataType) {
              case 'json':
                var json = JSON.parse(result);
                return Promise.resolve(json);
              case 'xml':
                var parser = new DOMParser();
                var xml = parser.parseFromString(result, 'text/xml');
                return Promise.resolve(xml);
            }
            return Promise.resolve(result);
          } catch (e) {
            return Promise.reject({
              status: 'fail',
              message: 'パース失敗',
              error: e
            });
          }
        });
      },
      configBridge: function(config) {
        var self = this;
        var keys = config.getKeys();
        self._config = config;

        return new Promise(function(resolve, reject) {
          self._configBridgeResolve = resolve;
          self._configBridgeReject  = reject;
          self._postMessage({
            url: '',
            command: 'dumpConfig',
            keys: keys
          });
        });
      },
      _postMessage: function(message, needPromise) {
        var self = this;
        return new Promise(function(resolve, reject) {
          message.sessionId = self._type + '_' + Math.random();
          message.token = TOKEN;
          if (needPromise) {
            self._sessions[message.sessionId] = {
              resolve: resolve,
              reject: reject
            };
          }

          return self._initializeFrame().then(function() {
            try {
              self._loaderWindow.postMessage(
                JSON.stringify(message),
                self._origin
              );
            } catch (e) {
              console.log('%cException!', 'background: red;', e);
            }
          });
        });
      },
      _onDumpConfig: function(configData) {
        //window.console.log('_onDumpConfig', configData);
        var self = this;
        _.each(Object.keys(configData), function(key) {
          //window.console.log('config %s: %s', key, configData[key]);
          self._config.setValue(key, configData[key]);
        });

        if (!location.host.match(/^[a-z0-9]*.nicovideo.jp$/) &&
            !this._config.getValue('allowOtherDomain')) {
          window.console.log('allowOtherDomain', this._config.getValue('allowOtherDomain'));
          self._configBridgeReject();
          return;
        }
        this._config.on('update', function(key, value) {
          if (key === 'autoCloseFullScreen') { return; }

          self._postMessage({
            command: 'saveConfig',
            key: key,
            value: value
          });
        });
        self._configBridgeResolve();
      },
      pushHistory: function(path, title) {
        var self = this;
        var sessionId = self._type +'_' + Math.random();
        self._initializeFrame().then(function() {
          try {
            self._loaderWindow.postMessage(JSON.stringify({
              sessionId: sessionId,
              command: 'pushHistory',
              path: path,
              title: title || ''
            }),
            self._origin);
          } catch (e) {
            console.log('%cException!', 'background: red;', e);
          }
        });
      },
    });

    if (location.host !== 'www.nicovideo.jp') {
      NicoVideoApi = new CrossDomainGate({
        baseUrl: location.protocol + '//www.nicovideo.jp/favicon.ico',
        origin: location.protocol + '//www.nicovideo.jp/',
        type: 'nicovideoApi',
        messager: WindowMessageEmitter
      });
    }



    var StoryBoardInfoLoader = (function() {
      var crossDomainGates = {};

      var initializeByServer = function(server, fileId) {
        if (crossDomainGates[server]) {
          return crossDomainGates[server];
        }

        var baseUrl = '//' + server + '/smile?i=' + fileId;
        //window.console.log('create CrossDomainGate: ', server, baseUrl);

        crossDomainGates[server] = new CrossDomainGate({
          baseUrl: baseUrl,
          origin: location.protocol + '//' + server + '/',
          type: 'storyboard_' + server.split('.')[0].replace(/-/g, '_'),
          messager: WindowMessageEmitter
        });

        return crossDomainGates[server];
      };

      var reject = function(err) {
        return new Promise(function(res, rej) {
          window.setTimeout(function() { rej(err); }, 0);
        });
      };

      var parseStoryBoard = function($storyBoard, url) {
        var storyBoardId = $storyBoard.attr('id') || '1';
        return {
          id:       storyBoardId,
          url:      url.replace('sb=1', 'sb=' + storyBoardId),
          thumbnail:{
            width:    $storyBoard.find('thumbnail_width').text(),
            height:   $storyBoard.find('thumbnail_height').text(),
            number:   $storyBoard.find('thumbnail_number').text(),
            interval: $storyBoard.find('thumbnail_interval').text()
          },
          board: {
            rows:   $storyBoard.find('board_rows').text(),
            cols:   $storyBoard.find('board_cols').text(),
            number: $storyBoard.find('board_number').text()
          }
        };
      };

      var parseXml = function(xml, url) {
        var $xml = $(xml), $storyBoard = $xml.find('storyboard');

        if ($storyBoard.length < 1) {
          return null;
        }

        var info = {
          status:   'ok',
          message:  '成功',
          url:      url,
          movieId:  $xml.find('movie').attr('id'),
          duration: $xml.find('duration').text(),
          storyBoard: []
        };

        for (var i = 0, len = $storyBoard.length; i < len; i++) {
          var sbInfo = parseStoryBoard($($storyBoard[i]), url);
          info.storyBoard.push(sbInfo);
        }
        info.storyBoard.sort(function(a, b) {
          var idA = parseInt(a.id.substr(1), 10), idB = parseInt(b.id.substr(1), 10);
          return (idA < idB) ? 1 : -1;
        });
        return info;
      };


      var load = function(videoFileUrl) {
        var a = document.createElement('a');
        a.href = videoFileUrl;
        var server = a.host;
        var search = a.search;

        if (!/\?(.)=(\d+)\.(\d+)/.test(search)) {
          return reject({status: 'fail', message: 'invalid url', url: videoFileUrl});
        }

        var fileType = RegExp.$1;
        var fileId   = RegExp.$2;
        var key      = RegExp.$3;

        if (fileType !== 'm') {
          return reject({status: 'fail', message: 'unknown file type', url: videoFileUrl});
        }

        var gate = initializeByServer(server, fileId);

        return new Promise(function(resolve, reject) {
          var url = '//' + server + '/smile?m=' + fileId + '.' + key + '&sb=1';

          gate.load(url).then(function(result) {
            var info = parseXml(result, url);
            if (info) {
              resolve(info);
            } else {
              reject({
                status: 'fail',
                message: 'storyBoard not exist (1)',
                result: result,
                url: url
              });
            }
          }, function(err) {
            reject({
              status: 'fail',
              message: 'storyBoard not exist (2)',
              result: err,
              url: url
            });
          });
        });
      };

      return {
        load: load
      };
    })();
    ZenzaWatch.api.StoryBoardInfoLoader = StoryBoardInfoLoader;


//===END===
    ZenzaWatch.emitter.on('loadVideoInfo', function(data, type, r) {
      var info = data.flvInfo;
      var url = info.url;
      if (!url.match(/smile\?m=/) || url.match(/^rtmp/)) {
        return;
      }

      ZenzaWatch.api.StoryBoardInfoLoader.load(url).then(
        function(result) {
          window.console.info(result);
        },
        function(err) {
          window.console.info(err);
        }
      );
    });

/*
create_time : 1458338784
description_short : "GWって「ガンバレ、私」ってこと？天気の良さがうらめしい（１号）です。これからたくさんの方に「初音..."
first_retrieve : "2010-05-03 15:00:00"
id : "1272596175"
is_middle_thumbnail : false
last_res_body : "これ持ってるw 持ってる ルカさん美人だしミク お前らいい加減にしろ きたあ ... "
length : "2:03"
length_seconds : "123"
mylist_comment : ""
mylist_counter : "333"
num_res : "1232"
thread_update_time : "2015-05-09 06:54:09"
thumbnail_style : {offset_x: 0, offset_y: -15, width: 160}
thumbnail_url : "http://tn-skr3.smilevideo.jp/smile?i=10555830"
title : "【初音ミク】「magnet」のプレイ動画をちょっとだけ公開してみた【Project DIVA 2nd】"
view_counter : "123929"




<packet><thread thread="13xxxxxxxx" version="20090904" res_from="6369" userkey="xxxxxx" user_id="yyyyyy" scores="1" nicoru="1" with_global="1"/></packet>


// ok
<packet>
  <thread thread="1470725541" version="20090904" userkey="1471592562.~1~rCebwEJbGzlWSixw9lI2YlZWVDsf2qco7hgdBei3R_0" user_id="1472081" scores="1" nicoru="1" with_global="1"/>

  <thread_leaves thread="1470725541" userkey="1471592562.~1~rCebwEJbGzlWSixw9lI2YlZWVDsf2qco7hgdBei3R_0" user_id="1472081" scores="1" nicoru="1">0-24:100,1000</thread_leaves>

  <thread thread="1470725542" version="20090904" user_id="1472081" threadkey="1471592569.6z3FmteLEiSPTye5JGKpf4ElmMk" force_184="1" scores="1" nicoru="1" with_global="1"/>

  <thread_leaves thread="1470725542" user_id="1472081" threadkey="1471592569.6z3FmteLEiSPTye5JGKpf4ElmMk" force_184="1" scores="1" nicoru="1">0-24:100,1000</thread_leaves>
</packet>
// ng
<packet>
  <thread thread="1470725541" version="20090904" user_id="1472081" scores="1" nicoru="1" with_global="1" userkey="1471603499.~1~4jhpyBiMaT2OXWPSB78JV-y9pl4AdKGhQBB5wUC7V7o"></thread>

  <thread_leaves thread="1470725541" user_id="1472081" scores="1" nicoru="1" userkey="1471603499.~1~4jhpyBiMaT2OXWPSB78JV-y9pl4AdKGhQBB5wUC7V7o">0-24:100,1000</thread_leaves>

  <thread thread="1470725542" version="20090904" user_id="1472081" threadkey="1471603500.YgEECdx0MAyFE5DxAB2aHgtDQhA" force_184="1" scores="1" nicoru="1" with_global="1"></thread>

  <thread_leaves thread="1470725542" user_id="1472081" threadkey="1471603500.YgEECdx0MAyFE5DxAB2aHgtDQhA" force_184="1" scores="1" nicoru="1">0-24:100,1000</thread_leaves>
</packet>

//
//
//
//
//
//
//
// ng
<packet>
  <thread thread="1470725542" version="20061206" fork="1" click_revision="-1" res_from="-1000" user_id="1472081" threadkey="1471591927.lBm1v7L-NtK7sr2DWlSKq7mYGVc" force_184="1" scores="1" nicoru="1" with_global="1"></thread>

  <thread thread="1470725542" version="20090904" user_id="1472081" threadkey="1471591927.lBm1v7L-NtK7sr2DWlSKq7mYGVc" force_184="1" scores="1" nicoru="1" with_global="1" userkey="1471591925.~1~6iDHBt0EwWmnFiFhUhWnvviZTE_k7HC9Y9p1wlboums"></thread>

  <thread_leaves thread="1470725542" user_id="1472081" threadkey="1471591927.lBm1v7L-NtK7sr2DWlSKq7mYGVc" force_184="1" scores="1" nicoru="1">0-24:100,1000</thread_leaves>
</packet>



<packet>
  <thread thread="1451710033" version="20061206" res_from="-1000" fork="1" click_revision="-1" scores="1"/>
  <thread thread="1451710033" version="20090904" userkey="1471647753.~1~FdAz5yfQ5ZBtL74uDXhmdkoMQ2qCbsgFVIw-4sfGn0M" user_id="1472081" scores="1" nicoru="1" with_global="1"/>
  <thread_leaves thread="1451710033" userkey="1471647753.~1~FdAz5yfQ5ZBtL74uDXhmdkoMQ2qCbsgFVIw-4sfGn0M" user_id="1472081" scores="1" nicoru="1">0-2:100,250</thread_leaves>
</packet>

*/
console.log(VideoInfoLoader);
