function loadYouTubeAPI() {
  return new Promise((resolve, reject) => {
    if (window.YT && YT.Player) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.onload = () => waitForYouTubeAPI(resolve, reject);
    script.onerror = (err) => reject(err);
    document.body.appendChild(script);
  });
}

function waitForYouTubeAPI(resolve, reject) {
  const checkInterval = setInterval(() => {
    if (window.YT && YT.Player) {
      clearInterval(checkInterval);
      resolve();
    }
  }, 100);
}

class YouTubeLinkPlayer {
  constructor(options = {}) {
    this._videoGroups = new Map();
    this._individualVideos = new Map();
    this._players = new Map(); // Stockage des instances YT.Player
    this._options = {
      linkAttribute: "data-yt-link",
      targetAttribute: "data-yt-target",
      videoVisibleClass: "visible",
      videoWrapperClass: "video-wrapper",
      videoContainerClass: "video-container",
      transitionDuration: 500,
      onVideoShow: null,
      onVideoHide: null,
      onError: null,
      autoPlayOnShow: false,
      mute: false,
      pauseOnHide: true,
      rootContainer: null,
      ...options,
    };

    this._isPausedByProg = false;

    this._rootElement =
      this._options.rootContainer instanceof HTMLElement
        ? this._options.rootContainer
        : document.querySelector(this._options.rootContainer) || document;

    loadYouTubeAPI()
      .then(() => this._init())
      .catch((error) =>
        console.error("Erreur lors du chargement de l'API YouTube :", error)
      );
  }

  _init() {
    try {
      const videoLinks = this._rootElement.querySelectorAll(
        `a[${this._options.linkAttribute}]`
      );
      videoLinks.forEach(this._processLink.bind(this));
    } catch (error) {
      this._options.onError?.("Initialization failed: " + error.message);
    }
  }

  _processLink(link) {
    if (link.dataset.ytProcessed) return;
    const videoId = this._extractVideoId(link.href);
    if (videoId) {
      this._setupVideoContainer(link, videoId);
      link.dataset.ytProcessed = "true";
    }
  }

  _extractVideoId(url) {
    try {
      const regex =
        /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=|\/sandalsResorts#\w\/\w\/.*\/))([^\/&\?]{10,12})/;
      const match = url.match(regex);
      return match ? match[1] : null;
    } catch (error) {
      this._options.onError?.(`Failed to extract video ID: ${error.message}`);
      return null;
    }
  }

  _createPlayer(videoId, container, link) {
    const playerId = `youtube-player-${videoId}-${Date.now()}`;
    const playerDiv = document.createElement("div");
    playerDiv.id = playerId;
    container.appendChild(playerDiv);

    // Configuration du player
    const playerConfig = {
      videoId: videoId,
      playerVars: {
        enablejsapi: 1,
        origin: window.location.origin,
        mute: this._options.mute ? 1 : 0,
        autoplay: this._shouldAutoPlay(link) ? 1 : 0,
      },
      events: {
        onReady: () => {
          //  console.log("Player ready:", playerId);
        },
      },
    };

    const player = new YT.Player(playerDiv.id, playerConfig);
    this._players.set(playerId, player);
    return playerId;
  }

  _shouldAutoPlay(link) {
    if (link.dataset.autoplay === "false") return false;
    if (link.dataset.autoplay === "true") return true;
    return this._options.autoPlayOnShow;
  }

  _setupVideoContainer(link, videoId) {
    try {
      const videoWrapper = document.createElement("div");
      videoWrapper.classList.add(this._options.videoWrapperClass);

      const videoContainer = document.createElement("div");
      videoContainer.className = this._options.videoContainerClass;
      videoContainer.dataset.videoId = videoId;
      videoWrapper.appendChild(videoContainer);

      const targetId = link.getAttribute(this._options.targetAttribute);
      if (targetId) {
        this._setupGroupVideo(link, videoWrapper, videoId, targetId);
      } else {
        this._setupIndividualVideo(link, videoWrapper, videoId);
      }

      link.addEventListener("click", (e) => {
        e.preventDefault();
        this._handleVideoClick(link);
      });
    } catch (error) {
      this._options.onError?.(
        `Failed to setup video container: ${error.message}`,
        link
      );
    }
  }

  _setupGroupVideo(link, videoWrapper, videoId, targetId) {
    const targetContainer = document.getElementById(targetId);
    if (targetContainer) {
      if (!this._videoGroups.has(targetId)) {
        this._videoGroups.set(targetId, {
          visibleVideoLink: null,
          videos: new Set(),
          id: targetId,
        });
      }
      this._videoGroups
        .get(targetId)
        .videos.add({ link, container: videoWrapper, videoId });
      targetContainer.appendChild(videoWrapper);
    } else {
      this._options.onError?.(
        `Target container with id '${targetId}' not found`,
        link
      );
    }
  }

  _setupIndividualVideo(link, videoWrapper, videoId) {
    this._individualVideos.set(link, { container: videoWrapper, videoId });
    link.parentNode.insertBefore(videoWrapper, link.nextSibling);
  }

  _handleVideoClick(clickedLink) {
    try {
      const targetId = clickedLink.getAttribute(this._options.targetAttribute);
      if (targetId) {
        this._handleGroupVideo(clickedLink, targetId);
      } else {
        this._handleIndividualVideo(clickedLink);
      }
    } catch (error) {
      this._options.onError?.(
        `Failed to handle video click: ${error.message}`,
        clickedLink
      );
    }
  }

  _handleGroupVideo(clickedLink, targetId) {
    const group = this._videoGroups.get(targetId);
    if (group) {
      group.videos.forEach(({ link, container, videoId }) => {
        if (link === clickedLink) {
          this._toggleVisibility(group, link, container, videoId);
        } else {
          this._hideVideo(container, link, videoId, group);
        }
      });
    }
  }

  _handleIndividualVideo(clickedLink) {
    const videoData = this._individualVideos.get(clickedLink);
    if (videoData) {
      this._toggleVideo(videoData.container, clickedLink, videoData.videoId);
    }
  }

  _toggleVisibility(group, link, container, videoId) {
    if (group.visibleVideoLink === link) {
      this._hideVideo(container, link, videoId, group);
      group.visibleVideoLink = null;
    } else {
      const duration = group.visibleVideoLink
        ? this._options.transitionDuration
        : 0;
      this._showVideoWithDelay(container, link, videoId, duration, group);
    }
  }

  _showVideoWithDelay(container, link, videoId, duration, group) {
    setTimeout(() => {
      this._showVideo(container, link, videoId, group);
      if (group) group.visibleVideoLink = link;
    }, duration);
  }

  _hideVideo(container, link, videoId, group = null) {
    const playerId = container.dataset.playerId;
    if (!playerId) return;

    const player = this._players.get(playerId);
    if (player && this._options.pauseOnHide) {
      try {
        player.pauseVideo();
      } catch (error) {
        console.warn("Player not ready yet:", error);
      }
    }

    container.classList.remove(this._options.videoVisibleClass);
    this._options.onVideoHide?.(container, link, videoId, group);
  }

  _showVideo(container, link, videoId, group = null) {
    let playerId = container.dataset.playerId;

    if (!playerId) {
      playerId = this._createPlayer(
        videoId,
        container.querySelector(`.${this._options.videoContainerClass}`),
        link
      );
      container.dataset.playerId = playerId;
    }

    container.classList.add(this._options.videoVisibleClass);
    this._options.onVideoShow?.(container, link, videoId, group);
  }

  _toggleVideo(container, link, videoId) {
    const isVisible = container.classList.contains(
      this._options.videoVisibleClass
    );
    if (!isVisible) {
      this._showVideo(container, link, videoId);
    } else {
      this._hideVideo(container, link, videoId);
    }
  }

  initializeContainer(container) {
    const videoLinks = container.querySelectorAll(
      `a[${this._options.linkAttribute}]`
    );
    videoLinks.forEach(this._processLink.bind(this));
  }

  showAllVideos() {
    this._individualVideos.forEach(({ container, videoId }, link) => {
      this._showVideo(container, link, videoId);
    });

    this._videoGroups.forEach((group) => {
      if (!group.visibleVideoLink) {
        const firstVideo = Array.from(group.videos)[0];
        if (firstVideo) {
          const { container, link, videoId } = firstVideo;
          this._showVideo(container, link, videoId, group);
          group.visibleVideoLink = link;
        }
      }
    });
  }

  hideAllVideos() {
    this._individualVideos.forEach(({ container, videoId }, link) => {
      this._hideVideo(container, link, videoId);
    });

    this._videoGroups.forEach((group) => {
      group.videos.forEach(({ container, link, videoId }) => {
        this._hideVideo(container, link, videoId, group);
      });
      group.visibleVideoLink = null;
    });
  }

  destroy() {
    this._players.forEach((player, playerId) => {
      player.destroy();
      this._players.delete(playerId);
    });

    this._players.clear();

    // Nettoyer les conteneurs et les liens
    this._individualVideos.forEach(({ container }, link) => {
      container.remove();
      link.dataset.ytProcessed = null;
    });

    this._videoGroups.forEach((group) => {
      group.videos.forEach(({ container, link }) => {
        container.remove();
        link.dataset.ytProcessed = null;
      });
    });

    // Vider les maps
    this._videoGroups.clear();
    this._individualVideos.clear();
  }
}
