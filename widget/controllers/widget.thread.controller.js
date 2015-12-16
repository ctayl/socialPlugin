'use strict';

(function (angular) {
    angular.module('socialPluginWidget')
        .controller('ThreadCtrl', ['$scope', '$routeParams', 'SocialDataStore', 'Modals', '$rootScope', 'Buildfire', 'EVENTS', 'THREAD_STATUS', 'SocialItems','$q', function ($scope, $routeParams, SocialDataStore, Modals, $rootScope, Buildfire, EVENTS, THREAD_STATUS, SocialItems,$q) {
            var Thread = this;
            var userIds = [];
            var usersData = [];
            Thread.comments = [];
            Thread.userDetails = {};
            Thread.SocialItems = SocialItems.getInstance();
            var _receivePushNotification;
            Thread.getFollowingStatus = function () {
                return (typeof _receivePushNotification !== 'undefined') ? (_receivePushNotification ? THREAD_STATUS.FOLLOWING : THREAD_STATUS.FOLLOW) : '';
            };


            var checkAuthenticatedUser=function(callFromInit){
                var deferred=$q.defer();
                Buildfire.auth.getCurrentUser(function (err, userData) {
                    console.info('Current Logged In user details are -----------------', userData);
                    var context = Buildfire.context;
                    if (userData) {
                        deferred.resolve();
                        Thread.userDetails.userId = userData._id;
                        Thread.userDetails.userToken = userData.userToken;
                        SocialDataStore.getUserSettings({
                            threadId: Thread.post._id,
                            userId: Thread.userDetails.userId,
                            userToken: Thread.userDetails.userToken
                        }).then(function (response) {
                            console.log('inside getUser settings :::::::::::::', response);
                            if (response && response.data && response.data.result) {
                                console.log('getUserSettings response is: ', response);
                                _receivePushNotification = response.data.result.receivePushNotification;
                                Thread.userDetails.settingsId = response.data.result._id;
                                //                                                if (!$scope.$$phase)$scope.$digest();
                            } else if (response && response.data && response.data.error) {
                                console.log('response error is: ', response.data.error);
                            }
                        }, function (err) {
                            console.log('Error while logging in user is: ', err);
                        });
                    }
                    else {
                        deferred.reject();
                        if(!callFromInit)
                        Buildfire.auth.login();
                    }
                });
                return deferred.promise;
            }
            var init = function () {
                if ($routeParams.threadId) {
                    var posts = Thread.SocialItems.items.filter(function (el) {
                        return el.uniqueLink == $routeParams.threadId;
                    });
                    console.log(posts);
                    Thread.post = posts[0];
                    var uniqueIdsArray = [];
                    $rootScope.showThread = false;
                    //Thread.post = data.data.result;
                    Thread.showMore = Thread.post.commentsCount > 10;
                    uniqueIdsArray.push(Thread.post.uniqueLink);
                    userIds.push(Thread.post.userId);

                    checkAuthenticatedUser(true);

                    SocialDataStore.getThreadLikes(uniqueIdsArray).then(function (response) {
                        console.info('get thread likes response is: ', response.data.result);
                        if (response.data.error) {
                            console.error('Error while getting likes of thread by logged in user ', response.data.error);
                        } else if (response.data.result) {
                            console.info('Thread likes fetched successfully', response.data.result);
                            Thread.post.isUserLikeActive = response.data.result[0].isUserLikeActive;
                        }
                    }, function (err) {
                        console.log('Error while fetching thread likes ', err);
                    });
                }
            };
            init();

            Thread.getComments = function (postId, lastCommentId) {
                SocialDataStore.getCommentsOfAPost({threadId: postId, lastCommentId: lastCommentId}).then(
                    function (data) {
                        var uniqueLinksOfComments = [];
                        console.log('Success get Comments---------', data);
                        if (data && data.data && data.data.result)
                            Thread.comments = Thread.comments.concat(data.data.result);
                        Thread.comments.forEach(function (commentData) {
                            uniqueLinksOfComments.push(commentData.threadId + "cmt" + commentData._id);
                            if (userIds.indexOf(commentData.userId) == -1) {
                                userIds.push(commentData.userId);
                            }
                        });
                        getCommentsLikeAndUpdate(uniqueLinksOfComments);
                        if (userIds && userIds.length > 0) {
                            SocialDataStore.getUsers(userIds).then(function (response) {
                                console.info('Users fetching for comments and response is: ', response.data.result);
                                if (response.data.error) {
                                    console.error('Error while fetching users for comments ', response.data.error);
                                } else if (response.data.result) {
                                    console.info('Users fetched successfully for comments ', response.data.result);
                                    usersData = response.data.result;
                                }
                            }, function (err) {
                                console.log('Error while fetching users of comments inside thread page: ', err);
                            });
                        }
                    },
                    function (err) {
                        console.log('Error get Comments----------', err);
                    }
                );
            };
            /**
             * Thread.addComment method checks whether image is present or not in comment.
             */
            Thread.addComment = function () {

                var checkUserPromise=checkAuthenticatedUser(false);
                checkUserPromise.then(function(){
                    if (Thread.picFile && !Thread.waitAPICompletion) {                // image post
                        Thread.waitAPICompletion = true;
                        var success = function (response) {
                            console.log('response inside controller for image upload is: ', response);
                            addComment(response.data.result);
                        };
                        var error = function (err) {
                            console.log('Error is : ', err);
                            Thread.picFile = '';
                            Thread.comment = '';
                        };
                        SocialDataStore.uploadImage(Thread.picFile).then(success, error);
                    }
                    else if (Thread.comment && !Thread.waitAPICompletion) {
                        Thread.waitAPICompletion = true;
                        addComment();
                    }
                })


            };
            /**
             * loadMoreComments methods is loads the more comments of a post.
             */
            Thread.loadMoreComments = function () {
                if (Thread.comments && Thread.comments.length < Thread.post.commentsCount) {
                    SocialDataStore.getCommentsOfAPost({
                        threadId: Thread.post._id,
                        lastCommentId: Thread.comments[Thread.comments.length - 1]._id
                    }).then(
                        function (data) {
                            console.log('Success get Load more Comments---------', data);
                            if (data && data.data && data.data.result) {
                                Thread.comments = Thread.comments.concat(data.data.result);
                                Thread.showMore = Thread.comments.length < Thread.post.commentsCount ? true : false;
                                if (!$scope.$$phase)$scope.$digest();
                                console.log('After Update comments---------------------', Thread.comments);
                            }
                        },
                        function (err) {
                            console.log('Error get Load More Comments----------', err);
                        }
                    );
                } else {
                    Thread.showMore = false;
                }
            };
            /**
             * getUserName method is used to get the username on the basis of userId.
             * @param userId
             * @returns {string}
             */
            Thread.getUserName = function (userId) {
                var userName = '';
                usersData.some(function (userData) {
                    if (userData.userObject._id == userId) {
                        userName = userData.userObject.displayName || '';
                        return true;
                    }
                });
                return userName;
            };
            /**
             * getUserImage is used to get userImage on the basis of userId.
             * @param userId
             * @returns {string}
             */
            Thread.getUserImage = function (userId) {
                var userImageUrl = '';
                usersData.some(function (userData) {
                    if (userData.userObject._id == userId) {
                        userImageUrl = userData.userObject.imageUrl || '';
                        return true;
                    }
                });
                return userImageUrl;
            };
            /**
             * showMoreOptions method shows the more Option popup.
             */
            Thread.showMoreOptions = function () {
                var checkUserPromise=checkAuthenticatedUser(false);
                checkUserPromise.then(function(){
                    Modals.showMoreOptionsModal({}).then(function (data) {
                            console.log('Data in Successs------------------data');
                        },
                        function (err) {
                            console.log('Error in Error handler--------------------------', err);
                        });
                })

            };
            /**
             * likeThread method is used to like a post.
             * @param post
             * @param type
             */
            Thread.likeThread = function (post, type) {
               var checkUserPromise= checkAuthenticatedUser(false);
                checkUserPromise.then(function(){
                    var uniqueIdsArray = [];
                    uniqueIdsArray.push(post.uniqueLink);
                    var success = function (response) {
                        console.log('inside success of getThreadLikes', response);
                        if (response.data && response.data.result && response.data.result.length > 0) {
                            if (response.data.result[0].isUserLikeActive) {
                                SocialDataStore.addThreadLike(post, type).then(function (res) {
                                    console.log('thread gets liked', res);
                                    Buildfire.messaging.sendMessageToControl({
                                        'name': EVENTS.POST_LIKED,
                                        '_id': Thread.post._id
                                    });
                                    post.likesCount++;
                                    post.waitAPICompletion = false;
                                    post.isUserLikeActive = false;
                                    $rootScope.$broadcast(EVENTS.POST_LIKED);
                                    if (!$scope.$$phase)$scope.$digest();
                                }, function (err) {
                                    console.log('error while liking thread', err);
                                });
                            } else {
                                SocialDataStore.removeThreadLike(post, type).then(function (res) {
                                    console.log('thread like gets removed', res);
                                    if (res.data && res.data.result)
                                        Buildfire.messaging.sendMessageToControl({
                                            'name': EVENTS.POST_UNLIKED,
                                            '_id': Thread.post._id
                                        });
                                    post.likesCount--;
                                    post.waitAPICompletion = false;
                                    post.isUserLikeActive = true;
                                    $rootScope.$broadcast(EVENTS.POST_UNLIKED);
                                    if (!$scope.$$phase)$scope.$digest();
                                }, function (err) {
                                    console.log('error while removing like of thread', err);
                                });
                            }
                        }
                    };
                    var error = function (err) {
                        post.waitAPICompletion = false;
                        console.log('error is : ', err);
                    };
                    if (!post.waitAPICompletion) {
                        post.waitAPICompletion = true;
                        SocialDataStore.getThreadLikes(uniqueIdsArray).then(success, error);
                    }
                });

            };
            /**
             * follow method is used to follow the thread/post.
             */
            Thread.followUnfollow = function (isFollow) {
                var followNotification = false;
                if (isFollow == THREAD_STATUS.FOLLOWING) {
                    followNotification = false;
                } else if (isFollow == THREAD_STATUS.FOLLOW) {
                    followNotification = true;
                }
                SocialDataStore.saveUserSettings({
                    threadId: Thread.post._id,
                    userId: Thread.userDetails.userId,
                    userToken: Thread.userDetails.userToken,
                    settingsId: Thread.userDetails.settingsId,
                    receivePushNotification: followNotification
                }).then(function (data) {
                    console.log('Get User Settings------------------', data);
                    if (data && data.data && data.data.result) {
                        _receivePushNotification = data.data.result.receivePushNotification;
                    }
                }, function (err) {
                    console.log('Error while getting user Details--------------', err);
                });
            };
            /**
             * getDuration method to used to show the time from current.
             * @param timestamp
             * @returns {*}
             */
            Thread.getDuration = function (timestamp) {
                if (timestamp)
                    return moment(timestamp.toString()).fromNow();
            };

            Thread.likeComment = function (comment, type) {
                if(comment.isUserLikeActive && !comment.waitAPICompletion){
                    comment.isUserLikeActive=false;
                    comment.waitAPICompletion = true;
                    var uniqueIdsArray = [];
                    uniqueIdsArray.push(comment.threadId + "cmt" + comment._id);
                    SocialDataStore.getThreadByUniqueLink(comment.threadId + "cmt" + comment._id).then(
                        function (data) {
                            console.log('Datat in Get CommentBy uniqueLink-----------------', data);
                            data.data.result.threadId = comment.threadId;
                            SocialDataStore.addThreadLike(data.data.result, type).then(function (res) {
                                console.log('thread gets liked in thread page', res);
                                if(comment.likesCount)
                                    comment.likesCount++;
                                else
                                    comment.likesCount=1;
                                comment.waitAPICompletion = false;
                                $rootScope.$broadcast(EVENTS.COMMENT_LIKED);
                                if (!$scope.$$phase)$scope.$digest();
                                Buildfire.messaging.sendMessageToControl({'name': EVENTS.COMMENT_LIKED, 'postId': comment.threadId, '_id': comment._id});
                            }, function (err) {
                                comment.waitAPICompletion = false;
                                console.log('error while liking comment', err);
                            });
                        },
                        function (err) {
                            comment.waitAPICompletion = false;
                            console.log('Get comment like ----------------error', err);
                        }
                    );
                }
                else if(!comment.waitAPICompletion) {
                    comment.isUserLikeActive = true;
                    comment.waitAPICompletion = true;
                    SocialDataStore.getThreadByUniqueLink(comment.threadId + "cmt" + comment._id).then(
                        function (data) {
                            console.log('Datat in Get CommentBy uniqueLink-----------------', data);
                            data.data.result.threadId = comment.threadId;
                            SocialDataStore.removeThreadLike( data.data.result, type).then(function (res) {
                                console.log('Response--------------------------remove like--------',res);
                                comment.likesCount--;
                                comment.waitAPICompletion = false;
                                $rootScope.$broadcast(EVENTS.COMMENT_UNLIKED);
                                if (!$scope.$$phase)$scope.$digest();
                                Buildfire.messaging.sendMessageToControl({'name': EVENTS.COMMENT_UNLIKED, 'postId': comment.threadId, '_id': comment._id});
                            }, function (err) {
                                comment.waitAPICompletion = false;
                                console.error('error while removing like of thread', err);
                            });
                        },
                        function (err) {
                            comment.waitAPICompletion = false;
                            console.log('Get comment like ----------------error', err);
                        }
                    );
                }
            };
            Thread.deleteComment = function (commentId) {
                SocialDataStore.deleteComment(commentId, Thread.post._id).then(
                    function (data) {
                        Buildfire.messaging.sendMessageToControl({
                            name: EVENTS.COMMENT_DELETED,
                            _id: commentId,
                            postId: Thread.post._id
                        });
                        Thread.post.commentsCount--;
                        Thread.comments = Thread.comments.filter(function (el) {
                            return el._id != commentId;
                        });
                        if (!$scope.$$phase)
                            $scope.$digest();
                        console.log('Comment deleted=============================success----------data', data);
                    },
                    function (err) {
                        console.log('Comment deleted=============================Error----------err', err);
                    }
                );
            };
            /**
             * addComment method is used to add the comment to a post.
             * @param imageUrl
             */
            var addComment = function (imageUrl) {

                    SocialDataStore.addComment({
                        threadId: Thread.post._id,
                        comment: Thread.comment,
                        userToken: Thread.userDetails.userToken,
                        imageUrl: imageUrl || null
                    }).then(
                        function (data) {
                            console.log('Add Comment Successsss------------------', data);
                            Thread.picFile = '';
                            Thread.comment = '';
                            Thread.waitAPICompletion = false;
                            Thread.post.commentsCount++;
                            $rootScope.$broadcast(EVENTS.COMMENT_ADDED);
                            Buildfire.messaging.sendMessageToControl({'name': EVENTS.COMMENT_ADDED, '_id': Thread.post._id})
                            if (Thread.comments.length) {
                                Thread.getComments(Thread.post._id, Thread.comments[Thread.comments.length - 1]._id);
                            }
                            else {
                                Thread.getComments(Thread.post._id, null);
                            }
                        },
                        function (err) {
                            console.log('Add Comment Error------------------', err);
                            Thread.picFile = '';
                            Thread.comment = '';
                            Thread.waitAPICompletion = false;
                        }
                    );


            };
            var getCommentsLikeAndUpdate = function (uniqueLinksOfComments) {
                SocialDataStore.getThreadLikes(uniqueLinksOfComments).then(function (data) {
                        console.log('Response of a post comments like-----------------', data);
                        if(data && data.data && data.data.result && data.data.result.length){
                            console.log('In If------------------',data.data.result);
                            data.data.result.forEach(function (uniqueLinkData) {
                                Thread.comments.some(function(comment){
                                    if(uniqueLinkData.uniqueLink==(comment.threadId+"cmt"+comment._id)){
                                        comment.likesCount=uniqueLinkData.likesCount;
                                        comment.isUserLikeActive=uniqueLinkData.isUserLikeActive;
                                        console.log('Updated comments data------------------',comment);
                                        return true;
                                    }
                                });
                            });
                        }
                    },
                    function (err) {
                        console.log('Response error of comment likes ------------', err);
                    });
            };

            Thread.getComments(Thread.post._id, null);

            Buildfire.messaging.onReceivedMessage = function (event) {
                console.log('Widget syn called method in controller Thread called-----', event);
                if (event) {
                    switch (event.name) {
                        case EVENTS.POST_DELETED :
                            Thread.SocialItems.items = Thread.SocialItems.items.filter(function (el) {
                                return el._id != event._id;
                            });
                            if(event._id==Thread.post._id)
                            $rootScope.showThread = true;
                            $rootScope.$digest();
                            break;
                        case EVENTS.BAN_USER :
                            Thread.SocialItems.items = Thread.SocialItems.items.filter(function (el) {
                                return el.userId != event._id;
                            });
                            if (!$scope.$$phase)
                                $scope.$digest();
                            break;
                        case EVENTS.COMMENT_DELETED:
                            console.log('Comment Deleted in thread controlled evenet called-----------', event);
                            if (event.postId == Thread.post._id) {
                                Thread.post.commentsCount--;
                                Thread.comments = Thread.comments.filter(function (el) {
                                    return el._id != event._id;
                                });
                                if (!$scope.$$phase)
                                    $scope.$digest();
                            }
                            break;
                        default :
                            break;
                    }
                }
            };
        }])
})(window.angular);