class YouTubeLinkPlayer {
    constructor(options = {}) {
      this.options = {
        // Data attribute to identify video links
        linkAttribute: "data-yt-link",
        // Data attribute for target container
        targetAttribute: "data-yt-target",
        // Container class
        videoContainerClass: "video-container",
        // Visible state class
        videoVisibleClass: "video-visible",
        // Hidden state class
        videoHiddenClass: "video-hidden",
        // Custom styles (optional)
        customStyles: null,
        // Callback when video is shown
        onVideoShow: null,
        // Callback when video is hidden
        onVideoHide: null,
        ...options,
      };
  
      // Add required CSS if custom styles are not provided
      if (!this.options.customStyles) {
        this.addDefaultStyles();
      } else {
        this.addStyles(this.options.customStyles);
      }
  
      // Store video containers by target
      this.videoGroups = new Map(); // Map<targetId, Set<{link, container}>>
      // Store individual videos (no target)
      this.individualVideos = new Map(); // Map<link, container>
  
      this.init();
    }
  
    addStyles(styles) {
      const styleSheet = document.createElement("style");
      styleSheet.textContent = styles;
      document.head.appendChild(styleSheet);
    }
  
    addDefaultStyles() {
      const defaultStyles = `
        /* Hidden state */
        .${this.options.videoHiddenClass} {
          padding-bottom: 0 !important;
          margin: 0 !important;
          height: 0 !important;
          opacity: 0 !important;
          overflow: hidden;
        }
  
        /* Iframe hidden transition */
        .${this.options.videoHiddenClass} iframe {
          opacity: 0 !important;
        }
      `;
      this.addStyles(defaultStyles);
    }
  
    init() {
      const videoLinks = document.querySelectorAll(
        `a[${this.options.linkAttribute}]`
      );
  
      videoLinks.forEach((link) => {
        if (link.dataset.ytProcessed) return;
  
        const videoId = this.extractVideoId(link.href);
        if (!videoId) return;
  
        this.setupVideoContainer(link, videoId);
        link.dataset.ytProcessed = "true";
      });
    }
  
    extractVideoId(url) {
      const regex =
        /(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=|\/sandalsResorts#\w\/\w\/.*\/))([^\/&\?]{10,12})/;
      const match = url.match(regex);
      return match ? match[1] : null;
    }
  
    setupVideoContainer(link, videoId) {
      // Create container
      const videoContainer = document.createElement("div");
      videoContainer.className = this.options.videoContainerClass;
      videoContainer.classList.add(this.options.videoHiddenClass);
  
      // Create iframe
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${videoId}`;
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.allowFullscreen = true;
  
      // Add iframe to container
      videoContainer.appendChild(iframe);
  
      // Check for target container
      const targetId = link.getAttribute(this.options.targetAttribute);
      let targetContainer = null;
      
      if (targetId) {
        targetContainer = document.getElementById(targetId);
        if (!targetContainer) {
          console.warn(`Target container with id '${targetId}' not found`);
        } else {
          // Add to group
          if (!this.videoGroups.has(targetId)) {
            this.videoGroups.set(targetId, new Set());
          }
          this.videoGroups.get(targetId).add({ link, container: videoContainer });
          targetContainer.appendChild(videoContainer);
        }
      } else {
        // Add to individual videos
        this.individualVideos.set(link, videoContainer);
        link.parentNode.insertBefore(videoContainer, link.nextSibling);
      }
  
      // Add click handler
      link.addEventListener("click", (e) => {
        e.preventDefault();
        this.handleVideoClick(link);
      });
  
      // Force reflow to ensure initial state is applied
      videoContainer.offsetHeight;
    }
  
    handleVideoClick(clickedLink) {
      const targetId = clickedLink.getAttribute(this.options.targetAttribute);
      
      if (targetId) {
        // Get the group for this target
        const group = this.videoGroups.get(targetId);
        if (group) {
          // Hide all videos in this group except the clicked one
          group.forEach(({ link, container }) => {
            if (link === clickedLink) {
              this.toggleVideo(container, link);
            } else {
              this.hideVideo(container, link);
            }
          });
        }
      } else {
        // Individual video - just toggle it
        const container = this.individualVideos.get(clickedLink);
        if (container) {
          this.toggleVideo(container, clickedLink);
        }
      }
    }
  
    hideVideo(container, link) {
      container.classList.add(this.options.videoHiddenClass);
      if (this.options.onVideoHide) {
        this.options.onVideoHide(container, link);
      }
    }
  
    toggleVideo(container, link) {
      const isVisible = !container.classList.contains(
        this.options.videoHiddenClass
      );
  
      if (!isVisible) {
        // Show video
        container.classList.remove(this.options.videoHiddenClass);
        if (this.options.onVideoShow) {
          this.options.onVideoShow(container, link);
        }
      } else {
        // Hide video
        this.hideVideo(container, link);
      }
    }
}