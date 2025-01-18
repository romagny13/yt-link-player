class YouTubeLinkPlayer {
  constructor(options = {}) {
    this._videoGroups = new Map();
    this._individualVideos = new Map();
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
      ...options,
    };

    this._init();
  }

  // Méthodes privées avec underscore
  _init() {
    try {
      const videoLinks = document.querySelectorAll(
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

  _setupVideoContainer(link, videoId) {
    try {
      const videoWrapper = document.createElement("div");
      videoWrapper.classList.add(this._options.videoWrapperClass);

      const videoContainer = document.createElement("div");
      videoContainer.className = this._options.videoContainerClass;

      const iframe = document.createElement("iframe");
      let embedUrl = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;

      if (this._options.mute) embedUrl += "&mute=1";
      if (this._options.autoPlayOnShow) embedUrl += "&autoplay=1";

      iframe.src = embedUrl;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;

      videoContainer.appendChild(iframe);
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
      container.classList.add(this._options.videoVisibleClass);
      this._options.onVideoShow?.(container, link, videoId, group);
      if (group) group.visibleVideoLink = link;
    }, duration);
  }

  _hideVideo(container, link, videoId, group = null) {
    container.classList.remove(this._options.videoVisibleClass);
    this._options.onVideoHide?.(container, link, videoId, group);
  }

  _toggleVideo(container, link, videoId) {
    const isVisible = container.classList.contains(
      this._options.videoVisibleClass
    );
    if (!isVisible) {
      container.classList.add(this._options.videoVisibleClass);
      this._options.onVideoShow?.(container, link, videoId);
    } else {
      this._hideVideo(container, link, videoId);
    }
  }

  // Méthodes publiques (API publique)
  showAllVideos() {
    this._individualVideos.forEach(({ container, videoId }, link) => {
      container.classList.add(this._options.videoVisibleClass);
      this._options.onVideoShow?.(container, link, videoId);
    });

    this._videoGroups.forEach((group) => {
      group.videos.forEach(({ container, link, videoId }) => {
        container.classList.add(this._options.videoVisibleClass);
        this._options.onVideoShow?.(container, link, videoId, group);
      });
    });
  }

  hideAllVideos() {
    this._individualVideos.forEach(({ container, videoId }, link) => {
      container.classList.remove(this._options.videoVisibleClass);
      this._options.onVideoHide?.(container, link, videoId);
    });

    this._videoGroups.forEach((group) => {
      group.videos.forEach(({ container, link, videoId }) => {
        container.classList.remove(this._options.videoVisibleClass);
        this._options.onVideoHide?.(container, link, videoId, group);
      });
    });
  }

  destroy() {
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

    this._videoGroups.clear();
    this._individualVideos.clear();
  }
}
