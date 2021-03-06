var _extends = require("@babel/runtime/helpers/extends");

var _typeof = require("@babel/runtime/helpers/typeof");

var errors = require('./errors');

var utils = require('./utils');

var isObject = require('lodash/isObject');

var isPlainObject = require('lodash/isPlainObject');

var StreamUser = require('./user');

var signing = require('./signing');

var StreamFeed = function StreamFeed() {
  /**
   * Manage api calls for specific feeds
   * The feed object contains convenience functions such add activity, remove activity etc
   * @class StreamFeed
   */
  this.initialize.apply(this, arguments);
};

function replaceStreamObjects(obj) {
  var cloned = obj;

  if (Array.isArray(obj)) {
    cloned = obj.map(function (v) {
      return replaceStreamObjects(v);
    });
  } else if (isPlainObject(obj)) {
    cloned = {};

    for (var k in obj) {
      cloned[k] = replaceStreamObjects(obj[k]);
    }
  } else if (isObject(obj) && obj._streamRef !== undefined) {
    cloned = obj._streamRef();
  }

  return cloned;
}

StreamFeed.prototype = {
  initialize: function initialize(client, feedSlug, userId, token) {
    /**
     * Initialize a feed object
     * @method intialize
     * @memberof StreamFeed.prototype
     * @param {StreamClient} client - The stream client this feed is constructed from
     * @param {string} feedSlug - The feed slug
     * @param {string} userId - The user id
     * @param {string} [token] - The authentication token
     */
    if (!feedSlug || !userId) {
      throw new errors.FeedError('Please provide a feed slug and user id, ie client.feed("user", "1")');
    }

    if (feedSlug.indexOf(':') !== -1) {
      throw new errors.FeedError('Please initialize the feed using client.feed("user", "1") not client.feed("user:1")');
    }

    utils.validateFeedSlug(feedSlug);
    utils.validateUserId(userId); // raise an error if there is no token

    if (!this.apiSecret && !token) {
      throw new errors.FeedError('Missing token, in client side mode please provide a feed secret');
    }

    this.client = client;
    this.slug = feedSlug;
    this.userId = userId;
    this.id = this.slug + ':' + this.userId;
    this.token = token;
    this.feedUrl = this.id.replace(':', '/');
    this.feedTogether = this.id.replace(':', '');
    this.signature = this.feedTogether + ' ' + this.token; // faye setup

    this.notificationChannel = 'site-' + this.client.appId + '-feed-' + this.feedTogether;
    this.enrichByDefault = false;
  },
  addActivity: function addActivity(activity, callback) {
    /**
     * Adds the given activity to the feed and
     * calls the specified callback
     * @method addActivity
     * @memberof StreamFeed.prototype
     * @param {object} activity - The activity to add
     * @param {requestCallback} callback - Callback to call on completion
     * @return {Promise} Promise object
     */
    activity = replaceStreamObjects(activity);

    if (!activity.actor && this.client.currentUser) {
      activity.actor = this.client.currentUser._streamRef();
    }

    return this.client.post({
      url: 'feed/' + this.feedUrl + '/',
      body: activity,
      signature: this.signature
    }, callback);
  },
  removeActivity: function removeActivity(activityId, callback) {
    /**
     * Removes the activity by activityId
     * @method removeActivity
     * @memberof StreamFeed.prototype
     * @param  {string}   activityId Identifier of activity to remove
     * @param  {requestCallback} callback   Callback to call on completion
     * @return {Promise} Promise object
     * @example
     * feed.removeActivity(activityId);
     * @example
     * feed.removeActivity({'foreignId': foreignId});
     */
    var identifier = activityId.foreignId ? activityId.foreignId : activityId;
    var params = {};

    if (activityId.foreignId) {
      params['foreign_id'] = '1';
    }

    return this.client['delete']({
      url: 'feed/' + this.feedUrl + '/' + identifier + '/',
      qs: params,
      signature: this.signature
    }, callback);
  },
  addActivities: function addActivities(activities, callback) {
    /**
     * Adds the given activities to the feed and calls the specified callback
     * @method addActivities
     * @memberof StreamFeed.prototype
     * @param  {Array}   activities Array of activities to add
     * @param  {requestCallback} callback   Callback to call on completion
     * @return {Promise}               XHR request object
     */
    activities = replaceStreamObjects(activities);
    var data = {
      activities: activities
    };
    var xhr = this.client.post({
      url: 'feed/' + this.feedUrl + '/',
      body: data,
      signature: this.signature
    }, callback);
    return xhr;
  },
  follow: function follow(targetSlug, targetUserId, options, callback) {
    /**
     * Follows the given target feed
     * @method follow
     * @memberof StreamFeed.prototype
     * @param  {string}   targetSlug   Slug of the target feed
     * @param  {string}   targetUserId User identifier of the target feed
     * @param  {object}   options      Additional options
     * @param  {number}   options.activityCopyLimit Limit the amount of activities copied over on follow
     * @param  {requestCallback} callback     Callback to call on completion
     * @return {Promise}  Promise object
     * @example feed.follow('user', '1');
     * @example feed.follow('user', '1', callback);
     * @example feed.follow('user', '1', options, callback);
     */
    if (targetUserId instanceof StreamUser) {
      targetUserId = targetUserId.id;
    }

    utils.validateFeedSlug(targetSlug);
    utils.validateUserId(targetUserId);
    var activityCopyLimit;
    var last = arguments[arguments.length - 1]; // callback is always the last argument

    callback = last.call ? last : undefined;
    var target = targetSlug + ':' + targetUserId; // check for additional options

    if (options && !options.call) {
      if (typeof options.limit !== 'undefined' && options.limit !== null) {
        activityCopyLimit = options.limit;
      }
    }

    var body = {
      target: target
    };

    if (typeof activityCopyLimit !== 'undefined' && activityCopyLimit !== null) {
      body['activity_copy_limit'] = activityCopyLimit;
    }

    return this.client.post({
      url: 'feed/' + this.feedUrl + '/following/',
      body: body,
      signature: this.signature
    }, callback);
  },
  unfollow: function unfollow(targetSlug, targetUserId, optionsOrCallback, callback) {
    /**
     * Unfollow the given feed
     * @method unfollow
     * @memberof StreamFeed.prototype
     * @param  {string}   targetSlug   Slug of the target feed
     * @param  {string}   targetUserId [description]
     * @param  {requestCallback|object} optionsOrCallback
     * @param  {boolean}  optionOrCallback.keepHistory when provided the activities from target
     *                                                 feed will not be kept in the feed
     * @param  {requestCallback} callback     Callback to call on completion
     * @return {object}                XHR request object
     * @example feed.unfollow('user', '2', callback);
     */
    var options = {},
        qs = {};
    if (typeof optionsOrCallback === 'function') callback = optionsOrCallback;
    if (_typeof(optionsOrCallback) === 'object') options = optionsOrCallback;
    if (typeof options.keepHistory === 'boolean' && options.keepHistory) qs['keep_history'] = '1';
    utils.validateFeedSlug(targetSlug);
    utils.validateUserId(targetUserId);
    var targetFeedId = targetSlug + ':' + targetUserId;
    var xhr = this.client['delete']({
      url: 'feed/' + this.feedUrl + '/following/' + targetFeedId + '/',
      qs: qs,
      signature: this.signature
    }, callback);
    return xhr;
  },
  following: function following(options, callback) {
    /**
     * List which feeds this feed is following
     * @method following
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @param  {string}   options.filter Filter to apply on search operation
     * @param  {requestCallback} callback Callback to call on completion
     * @return {Promise} Promise object
     * @example feed.following({limit:10, filter: ['user:1', 'user:2']}, callback);
     */
    if (options !== undefined && options.filter) {
      options.filter = options.filter.join(',');
    }

    return this.client.get({
      url: 'feed/' + this.feedUrl + '/following/',
      qs: options,
      signature: this.signature
    }, callback);
  },
  followers: function followers(options, callback) {
    /**
     * List the followers of this feed
     * @method followers
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @param  {string}   options.filter Filter to apply on search operation
     * @param  {requestCallback} callback Callback to call on completion
     * @return {Promise} Promise object
     * @example
     * feed.followers({limit:10, filter: ['user:1', 'user:2']}, callback);
     */
    if (options !== undefined && options.filter) {
      options.filter = options.filter.join(',');
    }

    return this.client.get({
      url: 'feed/' + this.feedUrl + '/followers/',
      qs: options,
      signature: this.signature
    }, callback);
  },
  get: function get(options, callback) {
    /**
     * Reads the feed
     * @method get
     * @memberof StreamFeed.prototype
     * @param  {object}   options  Additional options
     * @param  {requestCallback} callback Callback to call on completion
     * @return {Promise} Promise object
     * @example feed.get({limit: 10, id_lte: 'activity-id'})
     * @example feed.get({limit: 10, mark_seen: true})
     */
    var path;

    if (options && options['mark_read'] && options['mark_read'].join) {
      options['mark_read'] = options['mark_read'].join(',');
    }

    if (options && options['mark_seen'] && options['mark_seen'].join) {
      options['mark_seen'] = options['mark_seen'].join(',');
    } // Shortcut options for reaction enrichment


    if (options && options.reactions) {
      if (options.reactions.own != null) {
        options.withOwnReactions = options.reactions.own;
      }

      if (options.reactions.recent != null) {
        options.withRecentReactions = options.reactions.recent;
      }

      if (options.reactions.counts != null) {
        options.withReactionCounts = options.reactions.counts;
      }

      if (options.reactions.own_children != null) {
        options.withOwnChildren = options.reactions.own_children;
      }

      delete options.reactions;
    }

    if (options && options.enrich == null && this.enrichByDefault) {
      options.enrich = this.enrichByDefault;
    }

    if (!options) {
      options = {
        enrich: this.enrichByDefault
      };
    }

    if (options && (options.enrich === true || options.ownReactions != null || options.withRecentReactions != null || options.withReactionCounts != null || options.withOwnChildren != null)) {
      path = 'enrich/feed/';
    } else {
      path = 'feed/';
    }

    var qs = _extends(options);

    delete options.enrich;
    delete options.reactions;
    return this.client.get({
      url: path + this.feedUrl + '/',
      qs: qs,
      signature: this.signature
    }, callback);
  },
  getReadOnlyToken: function getReadOnlyToken() {
    /**
     * Returns a token that allows only read operations
     *
     * @deprecated since version 4.0
     * @method getReadOnlyToken
     * @memberof StreamClient.prototype
     * @param {string} feedSlug - The feed slug to get a read only token for
     * @param {string} userId - The user identifier
     * @return {string} token
     * @example
     * client.getReadOnlyToken('user', '1');
     */
    var feedId = '' + this.slug + this.userId;
    return signing.JWTScopeToken(this.client.apiSecret, '*', 'read', {
      feedId: feedId,
      expireTokens: this.client.expireTokens
    });
  },
  getReadWriteToken: function getReadWriteToken() {
    /**
     * Returns a token that allows read and write operations
     * @deprecated since version 4.0
     * @method getReadWriteToken
     * @memberof StreamClient.prototype
     * @param {string} feedSlug - The feed slug to get a read only token for
     * @param {string} userId - The user identifier
     * @return {string} token
     * @example
     * client.getReadWriteToken('user', '1');
     */
    var feedId = '' + this.slug + this.userId;
    return signing.JWTScopeToken(this.client.apiSecret, '*', '*', {
      feedId: feedId,
      expireTokens: this.client.expireTokens
    });
  },
  getActivityDetail: function getActivityDetail(activity_id, options, callback) {
    /**
     * Retrieves one activity from a feed and adds enrichment
     * @method getActivityDetail
     * @memberof StreamFeed.prototype
     * @param  {array}    ids  Additional options
     * @param  {object}   options  Additional options
     * @param  {requestCallback} callback Callback to call on completion
     * @return {Promise} Promise object
     * @example feed.getActivityDetail(activity_id)
     * @example feed.getActivityDetail(activity_id, {withRecentReactions: true})
     * @example feed.getActivityDetail(activity_id, {withReactionCounts: true})
     * @example feed.getActivityDetail(activity_id, {withOwnReactions: true, withReactionCounts: true})
     */
    return this.get(_extends({
      id_lte: activity_id,
      id_gte: activity_id,
      limit: 1
    }, options), callback);
  },
  getFayeClient: function getFayeClient() {
    /**
     * Returns the current faye client object
     * @method getFayeClient
     * @memberof StreamFeed.prototype
     * @access private
     * @return {object} Faye client
     */
    return this.client.getFayeClient();
  },
  subscribe: function subscribe(callback) {
    /**
     * Subscribes to any changes in the feed, return a promise
     * @method subscribe
     * @memberof StreamFeed.prototype
     * @param  {function} callback Callback to call on completion
     * @return {Promise}           Promise object
     * @example
     * feed.subscribe(callback).then(function(){
     * 		console.log('we are now listening to changes');
     * });
     */
    if (!this.client.appId) {
      throw new errors.SiteError('Missing app id, which is needed to subscribe, use var client = stream.connect(key, secret, appId);');
    }

    var subscription = this.getFayeClient().subscribe('/' + this.notificationChannel, callback);
    this.client.subscriptions['/' + this.notificationChannel] = {
      token: this.token,
      userId: this.notificationChannel,
      fayeSubscription: subscription
    };
    return subscription;
  },
  unsubscribe: function unsubscribe() {
    /**
     * Cancel updates created via feed.subscribe()
     * @return void
     */
    var streamSubscription = this.client.subscriptions['/' + this.notificationChannel];

    if (streamSubscription) {
      delete this.client.subscriptions['/' + this.notificationChannel];
      streamSubscription.fayeSubscription.cancel();
    }
  },
  updateActivityToTargets: function updateActivityToTargets(foreign_id, time, new_targets, added_targets, removed_targets) {
    /**
     * Updates an activity's "to" fields
     * @since 3.10.0
     * @param {string} foreign_id The foreign_id of the activity to update
     * @param {string} time The time of the activity to update
     * @param {array} new_targets Set the new "to" targets for the activity - will remove old targets
     * @param {array} added_targets Add these new targets to the activity
     * @param {array} removed_targets Remove these targets from the activity
     */
    if (!foreign_id) {
      throw new Error('Missing `foreign_id` parameter!');
    } else if (!time) {
      throw new Error('Missing `time` parameter!');
    }

    if (!new_targets && !added_targets && !removed_targets) {
      throw new Error('Requires you to provide at least one parameter for `new_targets`, `added_targets`, or `removed_targets` - example: `updateActivityToTargets("foreignID:1234", new Date(), [new_targets...], [added_targets...], [removed_targets...])`');
    }

    if (new_targets) {
      if (added_targets || removed_targets) {
        throw new Error("Can't include add_targets or removed_targets if you're also including new_targets");
      }
    }

    if (added_targets && removed_targets) {
      // brute force - iterate through added, check to see if removed contains that element
      for (var i = 0; i < added_targets.length; i++) {
        // would normally use Array.prototype.includes here, but it's not supported in Node.js v4 :(
        for (var j = 0; j < removed_targets.length; j++) {
          if (removed_targets[j] == added_targets[i]) {
            throw new Error("Can't have the same feed ID in added_targets and removed_targets.");
          }
        }
      }
    }

    var body = {
      foreign_id: foreign_id,
      time: time
    };

    if (new_targets) {
      body['new_targets'] = new_targets;
    }

    if (added_targets) {
      body['added_targets'] = added_targets;
    }

    if (removed_targets) {
      body['removed_targets'] = removed_targets;
    }

    return this.client.post({
      url: 'feed_targets/' + this.feedUrl + '/activity_to_targets/',
      signature: this.signature,
      body: body
    });
  }
};
module.exports = StreamFeed;