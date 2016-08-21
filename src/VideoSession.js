const $ = require('jquery');
const _ = require('lodash');
const ZenzaWatch = {
  util:{},
  debug: {},
  api: {}
};
//var AsyncEmitter = function() {};
const VideoInfoLoader = {};
const PopupMessage = {};
const ajax = function() {};

//===BEGIN===

var VideoSession = (function() {

  const OLD_HEART_BEAT_INTERVAL_MS    = 15 * 60 * 1000; // 15min
  const DMC_HEART_BEAT_INTERVAL_MS    = 30 * 1000;      // 30sec

  const CHECK_PAUSE_INTERVAL      = 30 * 1000;
  const SESSION_CLOSE_PAUSE_COUNT = 3;
  const SESSION_CLOSE_FAIL_COUNT  = 3;
  const SESSION_CLOSE_TIME_MS     = 12 * 60 * 1000; // 12min

  const VIDEO_QUALITY = {
    auto: /.*/,
    high: /_(1080p|720p)$/,
    mid:  /_(540p|480p)$/,
    low:  /_(360p)$/
  };

  class DmcPostData {
    constructor(dmcInfo, videoQuality) {
      this._dmcInfo = dmcInfo;
      this._videoQuality = videoQuality || 'auto';
    }

    toString() {
      var dmcInfo = this._dmcInfo;

      // たぶんここの順番をなんやかんやすると画質優先度が変わる
      var videos = [];
//            archive_h264_2000kbps_720p
//            archive_h264_1000kbps_540p
//            archive_h264_600kbps_360p
//            archive_h264_300kbps_360p
      var reg = VIDEO_QUALITY[this._videoQuality] || VIDEO_QUALITY.auto;
      _.each(dmcInfo.videos, function(format) {
        if (reg.test(format))  { videos.push(`<string>${format}</string>`); }
      });
      _.each(dmcInfo.videos, function(format) {
        if (!reg.test(format)) { videos.push(`<string>${format}</string>`); }
      });

      var audios = []; //            archive_aac_64kbps
      _.each(dmcInfo.audios, function(format) {
        audios.push(`<string>${format}</string>`);
      });

       return (
        `
<session>
  <recipe_id>${dmcInfo.recipeId}</recipe_id>
  <content_id>${dmcInfo.contentId}</content_id>
  <content_type>movie</content_type>
  <protocol>
    <name>${dmcInfo.protocols.join(',')}</name>
    <parameters>
      <http_parameters>
        <method>GET</method>
        <parameters>
          <http_output_download_parameters>
            <file_extension>mp4</file_extension>
          </http_output_download_parameters>
        </parameters>
      </http_parameters>
    </parameters>
  </protocol>
  <priority>${dmcInfo.priority}</priority>
  <content_src_id_sets>
    <content_src_id_set>
      <content_src_ids>
        <src_id_to_mux>
          <video_src_ids>
            ${videos.join('')}
          </video_src_ids>
          <audio_src_ids>
            ${audios.join('')}
          </audio_src_ids>
        </src_id_to_mux>
      </content_src_ids>
    </content_src_id_set>
  </content_src_id_sets>
  <keep_method>
    <heartbeat>
      <lifetime>${dmcInfo.heartBeatLifeTimeMs}</lifetime>
    </heartbeat>
  </keep_method>
  <timing_constraint>unlimited</timing_constraint>
  <session_operation_auth>
    <session_operation_auth_by_signature>
      <token>${dmcInfo.token}</token>
      <signature>${dmcInfo.signature}</signature>
    </session_operation_auth_by_signature>
  </session_operation_auth>
  <content_auth>
    <auth_type>ht2</auth_type>
    <service_id>nicovideo</service_id>
    <service_user_id>${dmcInfo.serviceUserId}</service_user_id>
    <max_content_count>10</max_content_count>
    <content_key_timeout>600000</content_key_timeout>
  </content_auth>
  <client_info>
    <player_id>${dmcInfo.playerId}</player_id>
  </client_info>
</session>
        `
      ).trim();
    }
  }

  class VideoSession {
    constructor(params) {
      this._videoInfo = params.videoInfo;
      this._videoWatchOptions = params.videoWatchOptions;

      this._isPlaying = params.isPlayingCallback || _.noop;
      this._pauseCount = 0;
      this._failCount  = 0;
      this._lastResponse = '';
      this._videoQuality = params.videoQuality || 'auto';
      this._videoSessionInfo = {};

      var serverType = this._serverType = params.serverType || 'dmc';
      if (serverType === 'dmc') {
        this._heartBeatInterval = DMC_HEART_BEAT_INTERVAL_MS;
        this._heartBeat         = this._heartBeatDmc.bind(this);
        this._createSession     = this._createSessionDmc.bind(this);
        this._deleteSession     = this._deleteSessionDmc.bind(this);
      } else {
        this._heartBeatInterval = OLD_HEART_BEAT_INTERVAL_MS;
        this._heartBeat         = this._heartBeatOld.bind(this);
        this._createSession     = this._createSessionOld.bind(this);
        this._deleteSession     = this._deleteSessionOld.bind(this);
      }
      this._heartBeatTimer = null;

      this._onHeartBeatSuccess = this._onHeartBeatSuccess.bind(this);
      this._onHeartBeatFail    = this._onHeartBeatFail.bind(this);
    }

    _createSessionDmc(videoInfo) {
      var dmcInfo = videoInfo.getDmcInfo();
      window.console.time('create DMC session');
      return new Promise(function(resolve, reject) {
        var url = `${dmcInfo.apiUrl}?_format=xml`;

        //window.console.log('dmc post', url, (new DmcPostData(dmcInfo)).toString());

        ajax({
          url: url,
          type: 'post',
          timeout: 10000,
          dataType: 'text',
          data: (new DmcPostData(dmcInfo, this._videoQuality)).toString()
        }).then(
          function(result) {
            //window.console.log('create api result', result, result.toString());
            var doc = (new DOMParser()).parseFromString(result, 'text/xml');
            var url =
              doc.querySelector('content_uri').firstChild.nodeValue.trim();
            var sessionId =
              doc.querySelector('session id').firstChild.nodeValue.trim();
            var videoFormat =
              doc.querySelector('video_src_ids string').firstChild.nodeValue.trim();
            var audioFormat =
              doc.querySelector('audio_src_ids string').firstChild.nodeValue.trim();

            this._heartBeatUrl =
              `${dmcInfo.apiUrl}/${sessionId}?_format=xml&_method=PUT`;
            this._deleteSessionUrl =
              `${dmcInfo.apiUrl}/${sessionId}?_format=xml&_method=DELETE`;

            this._lastResponse = doc.querySelector('session').outerHTML;
            this._videoSessionInfo = {
              type: 'dmc',
              url: url,
              sessionId: sessionId,
              videoFormat: videoFormat,
              audioFormat: audioFormat,
              heartBeatUrl: this._heartBeatUrl,
              deleteSessionUrl: this._deleteSessionUrl,
              lastResponse: result
            };
            //window.console.info('session info: ', this._videoSessionInfo);
            this.enableHeartBeat();
            window.console.timeEnd('create DMC session');
            resolve(this._videoSessionInfo);
          }.bind(this),
          function(err) {
            window.console.error('create api fail', err);
            reject(err);
          });
      }.bind(this));
    }

    _createSessionOld(videoInfo) {
      this.enableHeartBeat();
      return new Promise(function(resolve) {
        var videoUrl = videoInfo.getVideoUrl();
        return resolve(videoUrl);
      }.bind(this));
    }

    create() {
      this._createdAt = Date.now();
      return this._createSession(this._videoInfo);
    }

    enableHeartBeat() {
      this.disableHeartBeat();
      this._heartBeatTimer =
        setInterval(this._onHeartBeatInterval.bind(this), this._heartBeatInterval);
      this._pauseCheckTimer =
        setInterval(this._onPauseCheckInterval.bind(this), CHECK_PAUSE_INTERVAL);
    }

    disableHeartBeat() {
      if (this._heartBeatTimer) {
        clearInterval(this._heartBeatTimer);
      }
      if (this._pauseCheckTimer) {
        clearInterval(this._pauseCheckTimer);
      }
      this._heartBeatTimer = this._pauseCheckTimer = null;
    }

    _onHeartBeatInterval() {
      if (this._isClosed) { return; }

      //PopupMessage.debug('HeartBeat!!!!');
      this._heartBeat();
    }

    _heartBeatOld() {
      //視聴権のcookieを取得するだけなのでwatchページを叩くだけでいいはず？
      var url = this._videoInfo.getWatchUrl();
      if (this._videoInfo.isEconomy()) {
        url += '?eco=1';
      }
      ajax({
        url: url,
        timeout: 10000,
        xhrFields: { withCredentials: true },
      }).then(
        this._onHeartBeatSuccess,
        this._onHeartBeatFail
      );
    }

    _heartBeatDmc() {
      var url = this._videoSessionInfo.heartBeatUrl;
      //window.console.log('HeartBeat');
      ajax({
        url: url,
        type: 'post',
        dataType: 'text',
        timeout: 10000,
        data: this._lastResponse
      }).then(
        this._onHeartBeatSuccess,
        this._onHeartBeatFail
      );
    }


    _deleteSessionDmc() {
      if (this._isDeleted) { return; }
      this._isDeleted = true;
      var url = this._videoSessionInfo.deleteSessionUrl;
      ajax({
        url: url,
        type: 'post',
        dataType: 'text',
        timeout: 10000,
        data: this._lastResponse
      }).then(
        function() { console.log('delete success'); },
        function() { console.log('delete fail'); }
      );
    }


    _deleteSessionOld() {
      // nothing
    }


    _onHeartBeatSuccess(result) {
      //PopupMessage.debug('HeartBeat ok');
      //window.console.log('HeartBeatSuccess');
      if (this._serverType === 'dmc') {
        var doc = (new DOMParser()).parseFromString(result, 'text/xml');
        this._lastResponse = doc.querySelector('session').outerHTML;
      } else {
        this._lastResponse = result;
      }
    }

    _onHeartBeatFail() {
      //PopupMessage.debug('HeartBeat fail');
      this._failCount++;
      if (this._failCount >= SESSION_CLOSE_FAIL_COUNT) {
        this.close();
      }
    }

    _onPauseCheckInterval() {
      if (this._isClosed) { return; }
      var isPlaying = this._isPlaying();
      //window.console.log('isPlaying?', isPlaying, this._pauseCount);
      if (!isPlaying) {
        this._pauseCount++;
      } else {
        this._pauseCount = 0;
      }
      //PopupMessage.debug('pause: ' + this._pauseCount);


      // 一定時間停止が続いた and 生成から一定時間経過している場合は破棄
      if (this._pauseCount             >= SESSION_CLOSE_PAUSE_COUNT &&
          Date.now() - this._createdAt >= SESSION_CLOSE_TIME_MS) {
        PopupMessage.debug('VideoSession closed.');
        this.close();
      }
    }

    close() {
      //PopupMessage.debug('session close');
      this._isClosed = true;
      this.disableHeartBeat();
      this._deleteSession();
    }
  }

  return VideoSession;
})();

//===END===
/*
sample_response = `
<?xml version="1.0" encoding="UTF-8" ?>
  <object>
    <meta status="201" message="created"/>
    <data>
    <session>
      <id>%SESSION_ID%</id>
      <recipe_id>nicovideo-%VIDEO_ID%</recipe_id>
      <content_id>out1</content_id>
      <content_src_id_sets>
      <content_src_id_set>
      <content_src_ids>
        <src_id_to_mux>
          <!--実際の画質-->
          <video_src_ids><string>archive_h264_1000kbps_540p</string></video_src_ids>
          <!--実際の音質-->
          <audio_src_ids><string>archive_aac_128kbps</string></audio_src_ids>
        </src_id_to_mux>
      </content_src_ids>
      </content_src_id_set>
      </content_src_id_sets>
      <content_type>movie</content_type>
      <timing_constraint>unlimited</timing_constraint>
      <keep_method>
      <heartbeat><lifetime>60000</lifetime>
      <onetime_token></onetime_token></heartbeat></keep_method>
      <protocol><name>http</name>
      <parameters>
        <http_parameters>
          <method>GET</method>
          <parameters><http_output_download_parameters>
          <file_extension>flv</file_extension>
          <transfer_preset></transfer_preset>
          </http_output_download_parameters>
        </parameters>
        </http_parameters>
      </parameters>
      </protocol>
      <play_seek_time>0</play_seek_time>
      <play_speed>1.0</play_speed>
      <content_uri>
        http://pa04.dmc.nico:2807/vod/ht2_nicovideo/nicovideo-%VIDEOID%_YYYYYY?ht2_nicovideo=%USERID%.omliyg_oc3d12_1a8zesd1aw3zn
      </content_uri>
      <session_operation_auth>
        <session_operation_auth_by_signature>
          <created_time>1471500446000</created_time>
          <expire_time>1471586846000</expire_time>
          <token>{...}</token>
          <signature>
            5e2e1bcb801ffa3d835de7e42410e8361e6bd68ca6182037942dd239396b7339
          </signature>
        </session_operation_auth_by_signature>
      </session_operation_auth>
      <content_auth>
        <auth_type>ht2</auth_type>
        <max_content_count>10</max_content_count>
        <content_key_timeout>600000</content_key_timeout>
        <service_id>nicovideo</service_id>
        <service_user_id>%USERID%</service_user_id>
        <content_auth_info><method>query</method>
        <name>ht2_nicovideo</name>
        <value>1472081.omliyg_oc3d12_1a8zesd1aw3zn</value>
        </content_auth_info>
      </content_auth>
      <runtime_info>
        <node_id></node_id>
        <execution_history/>
      </runtime_info>
      <client_info>
        <player_id>nicovideo-6-7i8lDrvLqJ_1471500446254</player_id>
        <remote_ip></remote_ip>
        <tracking_info></tracking_info>
      </client_info>
      <created_time>1471500470222</created_time>
      <modified_time>1471500470222</modified_time>
      <priority>0.80000000000000004441</priority>
      <content_route>0</content_route>
      <version></version>
    </session>
  </data>
</object>`.trim();

*/

module.exports = {
  VideoSession: VideoSession
};


