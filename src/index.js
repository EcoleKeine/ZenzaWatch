// ==UserScript==
// @name           ZenzaWatch
// @namespace      https://github.com/segabito/
// @description    ニコニコ動画の速くて軽い動画プレイヤー
// @match          *://www.nicovideo.jp/*
// @match          *://ext.nicovideo.jp/
// @match          *://ext.nicovideo.jp/#*
// @match          *://blog.nicovideo.jp/*
// @match          *://ch.nicovideo.jp/*
// @match          *://com.nicovideo.jp/*
// @match          *://commons.nicovideo.jp/*
// @match          *://dic.nicovideo.jp/*
// @match          *://ex.nicovideo.jp/*
// @match          *://info.nicovideo.jp/*
// @match          *://search.nicovideo.jp/*
// @match          *://uad.nicovideo.jp/*
// @match          *://api.search.nicovideo.jp/*
// @match          *://*.nicovideo.jp/smile*
// @exclude        *://ads.nicovideo.jp/*
// @exclude        *://www.upload.nicovideo.jp/*
// @exclude        *://www.nicovideo.jp/watch/*?edit=*
// @exclude        *://ch.nicovideo.jp/tool/*
// @exclude        *://flapi.nicovideo.jp/*
// @exclude        *://dic.nicovideo.jp/p/*
// @grant          none
// @author         segabito macmoto
// @license        public domain
// @version        1.12.6
// @require        https://cdnjs.cloudflare.com/ajax/libs/lodash.js/3.10.1/lodash.js
// @require        https://cdnjs.cloudflare.com/ajax/libs/fetch/2.0.1/fetch.js
// ==/UserScript==


(function() {
const PRODUCT = 'ZenzaWatch';
// 公式プレイヤーがurlを書き換えてしまうので読み込んでおく
const START_PAGE_QUERY = (location.search ? location.search.substring(1) : '');
const monkey = function(PRODUCT, START_PAGE_QUERY) {
  var console = window.console;
  var $ = window.ZenzaJQuery || window.jQuery, _ = window._;
  var TOKEN = 'r:' + (Math.random());
  START_PAGE_QUERY = unescape(START_PAGE_QUERY);
  //@version

  console.log(`exec ${PRODUCT} v${VER}...`);
  console.log('jQuery version: ', $.fn.jquery);

    var ZenzaWatch = {
      version: VER,
      debug: {},
      api: {},
      init: {},
      lib: {
        $: $,
        _: _
      },
      external: {},
      util: {
        hereDoc: function(func) { // えせヒアドキュメント
          return func.toString().match(/[^]*\/\*([^]*)\*\/\}$/)[1].replace(/\{\*/g, '/*').replace(/\*\}/g, '*/').trim();
        },
        callAsync: function(func, self, delay) {
          delay = delay || 0;
          if (self) {
            func = func.bind(self);
          }
          window.setTimeout(func, delay);
        },
        callOnIdle: function(func, self) {
          if (self) {
            func = func.bind(self);
          }
          if (window.requestIdleCallback) {
            window.requestIdleCallback(func);
          } else {
            window.setTimeout(func, 0);
          }
        }
      }
    };

    if (location.host.match(/\.nicovideo\.jp$/)) {
      window.ZenzaWatch = ZenzaWatch;
    } else {
      window.ZenzaWatch = {};
    }

    const util = ZenzaWatch.util;
    
//@require constant.js

//@require util.js

//@require loader.js

//@require VideoInfo.js

//@require loader/VideoSearch.js

//@require loader/TagEditApi.js

//@require loader/Storyboard.js

//@require NicoVideoPlayer.js

//@require StoryBoard.js

//@require VideoControlBar.js

//@require NicoTextParser.js

//@require CommentPlayer.js

//@require CommentLayoutWorker.js

//@require SlotLayoutWorker.js

//@require NicoScripter.js

//@require CommentPanel.js

//@require VideoList.js

//@require VideoSession.js

//@require NicoVideoPlayerDialog.js

//@require CommentInputPanel.js

//@require SettingPanel.js

//@require TagListView.js

//@require VideoInfoPanel.js

//@require GinzaSlayer.js

//@require initializer.js

};

//@require exApi.js

  if (window.ZenzaWatch) { return; }

  var host = window.location.host || '';
  var href = (location.href || '').replace(/#.*$/, '');
  var prot = location.protocol;
  if (href === prot + '//www.nicovideo.jp/favicon.ico' &&
      window.name === 'nicovideoApiLoader') {
    nicovideoApi();
  } else if (host.match(/^smile-.*?\.nicovideo\.jp$/)) {
    smileApi();
  } else if (host === 'api.search.nicovideo.jp' && window.name.startsWith('searchApiLoader')) {
    searchApi();
  } else if (host === 'ext.nicovideo.jp' && window.name.indexOf('thumbInfoLoader') >= 0) {
    thumbInfoApi();
  } else if (host === 'ext.nicovideo.jp' && window.name.indexOf('videoInfoLoaderLoader') >= 0) {
    exApi();
  } else if (window === top) {
    // ロードのタイミングによって行儀の悪い広告に乗っ取られることがあるので
    // 先にiframeだけ作っておく
    // 効果はいまいち・・・
    var iframe;
    for (var i = 0; i < 3; i++) {
      iframe = document.createElement('iframe');
      iframe.className = 'reservedFrame';
      iframe.style.position = 'fixed';
      iframe.style.left = '-9999px';
      iframe.srcdocType = typeof iframe.srcdoc;
      iframe.srcdoc = '<html></html>';
      document.body.appendChild(iframe);
    }


    var loadGm = function() {
      let script = document.createElement('script');
      script.id = 'ZenzaWatchLoader';
      script.setAttribute('type', 'text/javascript');
      script.setAttribute('charset', 'UTF-8');
      script.appendChild(
        document.createTextNode(`(${monkey})('${PRODUCT}', '${escape(START_PAGE_QUERY)}');` ));
      document.body.appendChild(script);
    };

    var MIN_JQ = 10000600000;
    var getJQVer = function() {
      if (!window.jQuery) {
        return 0;
      }
      var ver = [];
      var t = window.jQuery.fn.jquery.split('.');
      while(t.length < 3) { t.push(0); }
      _.each(t, function(v) { ver.push((v * 1 + 100000).toString().substr(1)); });
      return ver.join('') * 1;
    };

    var loadJq = function() {
      window.console.log('JQVer: ', getJQVer());
      window.console.info('load jQuery from cdn...');

      return new Promise(function (resolve, reject) {
        var $j = window.jQuery || null;
        var $$ = window.$ || null;
        var script = document.createElement('script');
        script.id = 'jQueryLoader';
        script.setAttribute('type', 'text/javascript');
        script.setAttribute('charset', 'UTF-8');
        script.src = 'https://ajax.googleapis.com/ajax/libs/jquery/2.2.0/jquery.min.js';
        document.body.appendChild(script);
        var count = 0;

        var tm = window.setInterval(function() {
          count++;

          if (getJQVer() >= MIN_JQ)  {
            window.clearInterval(tm);
            window.ZenzaJQuery = window.jQuery;
            if ($j) { window.jQuery = $j; }
            if ($$) { window.$      = $$; }
            resolve();
          }

          if (count >= 100) {
            window.clearInterval(tm);
            window.console.error('load jQuery timeout');
            reject();
          }

        }, 300);
      });
    };

    if (getJQVer() >= MIN_JQ) {
      loadGm();
    } else {
      loadJq().then(loadGm);
    }
  }
})();
