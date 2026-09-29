/* sfx.js
 * Copyright (c) 2026 Clove Nytrix Doughmination Twilight
 * Licensed under the DASL-1.0 Licence.
 * See LICENCE.md in the project root for full licence information.
 *
 * UI sounds: hover, click, toggle. On by default, muteable (persisted),
 * silenced under prefers-reduced-motion. Set window.SFX_BASE to point at the
 * folder holding hover.mp3 / click.mp3 / toggle.mp3 (defaults to "/sfx/").
 */
(function () {
  var base = window.SFX_BASE || "/sfx/";

  var reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;

  var STORE_KEY = "sfx-muted";

  function readMuted() {
    if (reduceMotion) return true;
    try {
      return localStorage.getItem(STORE_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  var muted = readMuted();

  var names = ["hover", "click", "toggle"];

  var sounds = {};
  names.forEach(function (name) {
    var audio = new Audio(base + name + ".mp3");
    audio.preload = "auto";
    audio.volume = 0.3;
    sounds[name] = audio;
  });

  var lastHover = 0;

  function play(name) {
    if (muted) return;
    var audio = sounds[name];
    if (!audio) return;
    try {
      audio.currentTime = 0;
      var attempt = audio.play();
      if (attempt && attempt.catch) attempt.catch(function () {});
    } catch (e) {}
  }

  var interactive = 'a,button,[role="button"],summary,.row,.copy,.zip';
  var toggleable = 'input[type="checkbox"],input[type="radio"],[role="switch"]';

  document.addEventListener(
    "pointerover",
    function (event) {
      var el = event.target.closest(interactive);
      if (!el) return;
      var now = Date.now();
      if (now - lastHover < 90) return;
      lastHover = now;
      play("hover");
    },
    true,
  );

  document.addEventListener(
    "click",
    function (event) {
      if (event.target.closest(toggleable)) {
        play("toggle");
        return;
      }
      if (event.target.closest(interactive)) play("click");
    },
    true,
  );

  document.addEventListener(
    "change",
    function (event) {
      if (event.target.matches(toggleable + ",select")) play("toggle");
    },
    true,
  );

  function label() {
    return muted ? "Unmute interface sounds" : "Mute interface sounds";
  }

  // Small blocky stroke icon — replacing the old 🔇/🔊 emoji glyphs.
  var ICON_ATTRS =
    'width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" style="vertical-align:-2px"';

  function glyph() {
    var speaker = '<path d="M3 9v6h4l5 4V5L7 9H3z"/>';
    var waves = muted
      ? '<path d="M16 9l5 6M21 9l-5 6"/>'
      : '<path d="M16 8a5 5 0 010 8M19 5a9 9 0 010 14"/>';
    return "<svg " + ICON_ATTRS + ">" + speaker + waves + "</svg>";
  }

  function mount() {
    var button = document.querySelector(".sfx-toggle");
    if (!button) {
      button = document.createElement("button");
      button.className = "sfx-toggle";
      document.body.appendChild(button);
    }
    button.type = "button";
    button.innerHTML = glyph();
    button.setAttribute("aria-label", label());

    button.addEventListener("click", function () {
      muted = !muted;
      try {
        localStorage.setItem(STORE_KEY, muted ? "1" : "0");
      } catch (e) {}
      button.innerHTML = glyph();
      button.setAttribute("aria-label", label());
      if (!muted) play("toggle");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
