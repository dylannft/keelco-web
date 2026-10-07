/* Keel Co — motion layer. Everything here is decoration on top of a page that works without it. */
(function () {
  "use strict";
  document.documentElement.classList.add("js");
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------
  // 1. The live call stage: ring, answer, talk, summarise, text.
  // ---------------------------------------------------------------
  var SCENES = [
    {
      chip: "Holiday letting", time: "11:42pm", sub: "Rang out at reception", ended: "Call ended after 1:48",
      lines: [
        ["ai", "Hi, thanks for calling. You're speaking with our virtual assistant. How can I help?"],
        ["caller", "I'm locked out. The key code isn't working."],
        ["ai", "Sorry you're dealing with that. Which building and unit are you in?"],
        ["caller", "Seabreeze, twelve oh four."],
        ["ai", "Thanks. I'm marking this as urgent for our on-call team now."]
      ],
      tags: [["Urgent", true], ["Lockout", false], ["Seabreeze 1204", false], ["Calling number confirmed", false]],
      sms: ["URGENT: Guest locked out", "Sam Lee, Seabreeze 1204. Key code not working. Call back 0400 111 222."]
    },
    {
      chip: "Physio clinic", time: "6:52pm", sub: "Front desk with a patient", ended: "Call ended after 1:21",
      lines: [
        ["ai", "Thanks for calling the clinic. You're speaking with our virtual assistant. How can I help?"],
        ["caller", "I've hurt my lower back. Can I get in tomorrow?"],
        ["ai", "I'm sorry to hear that. Are mornings or afternoons better for you?"],
        ["caller", "Early morning if possible."],
        ["ai", "Got it. I'll pass this to reception to confirm a time with you first thing."]
      ],
      tags: [["New patient", false], ["Booking request", false], ["Early mornings", false], ["Callback 8am", false]],
      sms: ["Booking request", "Mia Chen, new patient, lower back pain. Prefers early mornings. Call back 0412 555 019."]
    },
    {
      chip: "Plumbing", time: "9:58pm", sub: "Team on another job", ended: "Call ended after 1:34",
      lines: [
        ["ai", "Thanks for calling. You're speaking with our virtual assistant. What's happened?"],
        ["caller", "Our hot water system's burst. There's water everywhere."],
        ["ai", "Okay. If you can, turn off the water at the mains. What's the address?"],
        ["caller", "Twelve Ocean Parade, Burleigh."],
        ["ai", "Thanks. I'm sending this to our on-call plumber right now."]
      ],
      tags: [["Urgent", true], ["Burst HWS", false], ["12 Ocean Pde", false], ["Calling number confirmed", false]],
      sms: ["URGENT: Burst hot water system", "Josh Patel, 12 Ocean Pde, Burleigh. Water through laundry. Call back 0433 820 114."]
    }
  ];

  var stage = document.getElementById("stage");
  if (stage) runStage(stage);

  function runStage(st) {
    var $ = function (s) { return st.querySelector(s); };
    var chip = $("#sc-chip"), time = $("#sc-time"), state = $("#sc-state"), sub = $("#sc-sub");
    var lines = $("#sc-lines"), summary = $("#sc-summary"), sms = $("#sc-sms"), smsTitle = $("#sms-title"), smsBody = $("#sms-body");
    var wave = $("#wave"), pauseBtn = $("#sc-pause");
    var bars = [];
    for (var i = 0; i < 36; i++) { var b = document.createElement("i"); wave.appendChild(b); bars.push(b); }

    var paused = false, timers = [], scene = 0, talking = false;

    // Waveform: bars scale on the GPU (no layout work), and only while someone is
    // speaking and the stage is on screen. Otherwise they settle into a flat line.
    var t0 = performance.now(), onScreen = true, rafId = 0, flat = false;
    function setFlat() { if (flat) return; flat = true; for (var i = 0; i < bars.length; i++) bars[i].style.transform = "scaleY(.08)"; }
    function frame(now) {
      rafId = 0;
      if (!talking || paused || !onScreen) { setFlat(); return; }
      flat = false;
      var t = (now - t0) / 1000;
      for (var i = 0; i < bars.length; i++) {
        var h = 0.18 + 0.7 * Math.abs(Math.sin(t * 6.3 + i * 0.55) * Math.sin(t * 2.1 + i * 0.23) + 0.35 * Math.sin(t * 11 + i));
        bars[i].style.transform = "scaleY(" + Math.min(1, h).toFixed(3) + ")";
      }
      rafId = requestAnimationFrame(frame);
    }
    function wake() { if (!reduce && !rafId) rafId = requestAnimationFrame(frame); }

    function later(fn, ms) { timers.push(setTimeout(function () { if (!paused) fn(); else pending.push(fn); }, ms)); }
    var pending = [];

    function type(li, text, done) {
      if (reduce) { li.textContent = text; done(); return; }
      var cur = document.createElement("span"); cur.className = "cursor";
      var node = document.createTextNode(""); li.appendChild(node); li.appendChild(cur);
      var n = 0;
      (function step() {
        if (paused) { pending.push(step); return; }
        n += 2; node.data = text.slice(0, n);
        if (n < text.length) setTimeout(step, 26); else { li.removeChild(cur); done(); }
      })();
    }

    function play(s) {
      var S = SCENES[s];
      st.className = "stage"; st.removeAttribute("data-speaker");
      lines.innerHTML = ""; summary.innerHTML = ""; sms.classList.remove("show");
      chip.textContent = S.chip; time.textContent = S.time;
      smsTitle.textContent = S.sms[0]; smsBody.textContent = S.sms[1];

      if (reduce) { // Show the finished call, no motion.
        state.textContent = S.ended; sub.textContent = "Answered by Keel Co"; st.classList.add("is-ended");
        S.lines.forEach(function (l) { var li = document.createElement("li"); li.className = l[0]; li.textContent = l[1]; lines.appendChild(li); });
        S.tags.forEach(function (t) { var sp = document.createElement("span"); sp.textContent = t[0]; if (t[1]) sp.className = "urgent"; summary.appendChild(sp); });
        sms.classList.add("show"); return;
      }

      state.textContent = "Incoming call"; sub.textContent = S.sub; st.classList.add("is-ringing");
      later(function () {
        st.classList.remove("is-ringing"); st.classList.add("is-live");
        state.textContent = "Answered by Keel Co"; sub.textContent = "In your business's name";
        var k = 0;
        (function next() {
          if (k >= S.lines.length) { return finish(); }
          var L = S.lines[k++], li = document.createElement("li"); li.className = L[0];
          lines.appendChild(li); st.setAttribute("data-speaker", L[0]); talking = true; wake();
          type(li, L[1], function () { talking = false; st.removeAttribute("data-speaker"); later(next, 380); });
        })();
      }, 1900);

      function finish() {
        st.classList.remove("is-live"); st.classList.add("is-ended");
        state.textContent = S.ended; sub.textContent = "Summary saved to the call log";
        S.tags.forEach(function (t, i) {
          later(function () { var sp = document.createElement("span"); sp.textContent = t[0]; if (t[1]) sp.className = "urgent"; summary.appendChild(sp); }, 200 + i * 170);
        });
        later(function () { sms.classList.add("show"); }, 1200);
        later(function () { st.classList.add("fade"); }, 6200);
        later(function () { scene = (scene + 1) % SCENES.length; play(scene); }, 6800);
      }
    }

    pauseBtn.addEventListener("click", function () {
      paused = !paused;
      pauseBtn.setAttribute("aria-pressed", String(paused));
      pauseBtn.setAttribute("aria-label", paused ? "Play the example call" : "Pause the example call");
      pauseBtn.innerHTML = paused
        ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
      if (!paused) { var p = pending; pending = []; p.forEach(function (fn) { fn(); }); wake(); }
    });
    if (reduce) pauseBtn.hidden = true;

    // Only play while the stage is on screen.
    if ("IntersectionObserver" in window && !reduce) {
      var started = false;
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          onScreen = e.isIntersecting;
          if (onScreen) wake();
          if (e.isIntersecting && !started) { started = true; play(0); }
        });
      }, { threshold: 0.05 }).observe(st);
    } else { play(0); }
  }

  // ---------------------------------------------------------------
  // 2. Steps light up in order as you scroll through them.
  // ---------------------------------------------------------------
  var steps = document.querySelector(".steps");
  if (steps) {
    var items = [].slice.call(steps.children);
    if (reduce) { items.forEach(function (li) { li.classList.add("lit"); }); steps.style.setProperty("--progress", 1); }
    else {
      // At most one measurement per frame, and only touch the page when something changed.
      var queued = false, lastP = -1;
      var update = function () {
        queued = false;
        var r = steps.getBoundingClientRect(), vh = window.innerHeight;
        if (r.bottom < -200 || r.top > vh + 200) return;
        var p = Math.round(Math.max(0, Math.min(1, (vh * 0.85 - r.top) / (vh * 0.55))) * 100) / 100;
        if (p === lastP) return; lastP = p;
        steps.style.setProperty("--progress", p);
        items.forEach(function (li, i) { var on = p >= (i + 0.5) / items.length; if (li.classList.contains("lit") !== on) li.classList.toggle("lit", on); });
      };
      var onScroll = function () { if (!queued) { queued = true; requestAnimationFrame(update); } };
      window.addEventListener("scroll", onScroll, { passive: true }); update();
    }
  }

  // ---------------------------------------------------------------
  // 3. Dashboard preview: rise in, count up, return a waiting call.
  // ---------------------------------------------------------------
  var screen = document.querySelector(".screen");
  if (screen && "IntersectionObserver" in window && !reduce) {
    screen.classList.add("pre");
    var figs = [].slice.call(screen.querySelectorAll(".figs b"));
    var targets = figs.map(function (b) { return parseInt(b.textContent, 10) || 0; });
    figs.forEach(function (b) { b.textContent = "0"; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect(); screen.classList.remove("pre");
        var t0 = performance.now(), dur = 1100;
        (function tick(now) {
          var k = Math.min(1, (now - t0) / dur), ease = 1 - Math.pow(1 - k, 3);
          figs.forEach(function (b, i) { b.textContent = Math.round(targets[i] * ease); });
          if (k < 1) requestAnimationFrame(tick);
        })(t0);
        // One waiting call gets returned: the pill flips and the waiting count drops.
        setTimeout(function () {
          var pill = screen.querySelector("[data-flip]"), wait = figs[2];
          if (!pill) return;
          pill.classList.add("flip");
          setTimeout(function () { pill.className = "pill done flip"; pill.textContent = "Called back"; if (wait) wait.textContent = String(Math.max(0, targets[2] - 1)); }, 250);
        }, 2600);
      });
    }, { threshold: 0.35 });
    io.observe(screen);
  }
})();
