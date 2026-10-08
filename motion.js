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
      sms: ["URGENT: Guest locked out", "Bruce Wayne, Seabreeze 1204. Key code not working. Call back 0400 111 222."]
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
      sms: ["Booking request", "Ron Burgundy, new patient, lower back pain. Prefers early mornings. Call back 0412 555 019."]
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
      sms: ["URGENT: Burst hot water system", "John Pork, 12 Ocean Pde, Burleigh. Water through laundry. Call back 0433 820 114."]
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

    var paused = false, timers = [], scene = 0, talking = false, live = null, started = false;

    // Waveform: bars scale on the GPU (no layout work), and only while someone is
    // speaking and the stage is on screen. Otherwise they settle into a flat line.
    var t0 = performance.now(), onScreen = true, rafId = 0, flat = false;
    function setFlat() { if (flat) return; flat = true; for (var i = 0; i < bars.length; i++) bars[i].style.transform = "scaleY(.08)"; }
    function frame(now) {
      rafId = 0;
      if (live) { liveFrame(now); return; }
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

    function lockHeight() {
      // Measure on an invisible copy so the live animation is never disturbed.
      var c = st.cloneNode(true), max = 0;
      c.removeAttribute("id"); c.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;left:-9999px;top:0;height:auto;width:" + st.offsetWidth + "px";
      st.parentNode.appendChild(c);
      var cl = c.querySelector(".transcript"), cs = c.querySelector(".summary");
      SCENES.forEach(function (S) {
        cl.innerHTML = S.lines.map(function (l) { return '<li class="' + l[0] + '" style="animation:none">' + l[1].replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>"; }).join("");
        cs.innerHTML = S.tags.map(function (t) { return '<span style="animation:none">' + t[0] + "</span>"; }).join("");
        max = Math.max(max, c.scrollHeight);
      });
      c.parentNode.removeChild(c);
      st.style.height = Math.ceil(max + 4) + "px";
    }
    lockHeight();
    var lastW = window.innerWidth, rT;
    window.addEventListener("resize", function () {
      if (window.innerWidth === lastW) return; lastW = window.innerWidth;
      clearTimeout(rT); rT = setTimeout(lockHeight, 150);
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(lockHeight);

    function later(fn, ms) { timers.push(setTimeout(function () { if (live) return; if (!paused) fn(); else pending.push(fn); }, ms)); }
    var pending = [];

    function type(li, text, done) {
      if (reduce) { li.textContent = text; done(); return; }
      var cur = document.createElement("span"); cur.className = "cursor";
      var node = document.createTextNode(""); li.appendChild(node); li.appendChild(cur);
      var n = 0;
      (function step() {
        if (live) return;
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
      if (live) { if (live.ended) backToExamples(); return; }
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
      new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          onScreen = e.isIntersecting;
          if (onScreen) wake();
          if (e.isIntersecting && !started && !live) { started = true; play(0); }
        });
      }, { threshold: 0.05 }).observe(st);
    } else { started = true; play(0); }

    // -------------------------------------------------------------
    // Live mode: the visitor talks to the demo agent in the browser.
    // -------------------------------------------------------------
    var AGENT_ID = "agent_2901m4d911yjf2qsasvmwxrj8dqc";
    var SDK = "https://cdn.jsdelivr.net/npm/@elevenlabs/client@1.25.0/+esm";
    var talkBtn = $("#sc-talk"), hostBtns = [].slice.call(document.querySelectorAll("[data-talk]"));
    var ICON_PLAY = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
    var MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-2.1a7 7 0 0 0 6-6.9z" fill="currentColor"/></svg>';
    var HANG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 9c-1.6 0-3.1.3-4.6.8v3.1c0 .4-.2.7-.6.9-1 .5-1.9 1.1-2.6 1.8-.2.2-.4.3-.7.3s-.5-.1-.7-.3L.3 13.1A1 1 0 0 1 0 12.4c0-.3.1-.5.3-.7A16.9 16.9 0 0 1 12 7c4.5 0 8.6 1.8 11.7 4.7.2.2.3.4.3.7s-.1.5-.3.7l-2.5 2.5c-.2.2-.4.3-.7.3s-.5-.1-.7-.3c-.8-.7-1.7-1.3-2.6-1.8-.3-.2-.6-.5-.6-.9V9.8C15.1 9.3 13.6 9 12 9z" fill="currentColor"/></svg>';

    function setTalk(mode) {
      if (!talkBtn) return;
      talkBtn.classList.toggle("is-end", mode === "end");
      talkBtn.disabled = mode === "wait";
      talkBtn.innerHTML = (mode === "end" ? HANG : MIC) + "<span>" + (mode === "end" ? "End call" : mode === "wait" ? "Connecting" : mode === "again" ? "Talk again" : "Talk to Kate") + "</span>";
    }
    setTalk("start");

    function stopExamples() {
      timers.forEach(clearTimeout); timers = []; pending = []; started = true;
      st.className = "stage live-mode"; st.removeAttribute("data-speaker");
      lines.innerHTML = ""; summary.innerHTML = ""; sms.classList.remove("show");
      st.setAttribute("role", "region"); st.setAttribute("aria-label", "Live demo call with Kate");
      lines.removeAttribute("aria-hidden"); lines.setAttribute("aria-live", "polite");
      pauseBtn.hidden = true;
    }

    function backToExamples() {
      if (live && live.conv) { try { live.conv.endSession(); } catch (e) {} }
      live = null; paused = false;
      st.setAttribute("role", "img"); st.setAttribute("aria-label", "Animated example: Keel Co answers a missed call, talks with the caller, saves a summary and texts the on-call phone.");
      lines.setAttribute("aria-hidden", "true"); lines.removeAttribute("aria-live");
      pauseBtn.hidden = reduce; pauseBtn.setAttribute("aria-pressed", "false"); pauseBtn.setAttribute("aria-label", "Pause the example call");
      pauseBtn.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>';
      setTalk("start"); play(scene);
    }

    function say(role, text) {
      if (!text) return;
      var li = document.createElement("li"); li.className = role; li.textContent = text;
      lines.appendChild(li); lines.scrollTop = lines.scrollHeight;
    }

    function clock() {
      if (!live || !live.t0) return;
      var s = Math.floor((Date.now() - live.t0) / 1000);
      time.textContent = Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2);
    }

    // Bars follow the real audio: Kate's voice when she speaks, the visitor's mic otherwise.
    function liveFrame(now) {
      var c = live && live.conv;
      if (!c || live.ended || !onScreen || reduce) { setFlat(); return; }
      flat = false;
      var speaking = live.mode === "speaking";
      var data = null;
      try { data = speaking ? c.getOutputByteFrequencyData() : c.getInputByteFrequencyData(); } catch (e) {}
      var vol = 0; try { vol = speaking ? c.getOutputVolume() : c.getInputVolume(); } catch (e) {}
      var who = speaking ? "ai" : (vol > 0.04 ? "caller" : "");
      if (who) { if (st.getAttribute("data-speaker") !== who) st.setAttribute("data-speaker", who); } else st.removeAttribute("data-speaker");
      var n = bars.length, t = (now - t0) / 1000;
      for (var i = 0; i < n; i++) {
        var v;
        if (data && data.length) { var k = Math.floor(Math.abs(i - n / 2) / (n / 2) * Math.min(data.length, 48)); v = data[k] / 255; }
        else v = vol * (0.6 + 0.4 * Math.abs(Math.sin(t * 7 + i * 0.6)));
        bars[i].style.transform = "scaleY(" + Math.max(0.08, Math.min(1, v * 1.25)).toFixed(3) + ")";
      }
      rafId = requestAnimationFrame(frame);
    }

    function fail(title, detail) {
      if (live) { live.ended = true; clearInterval(live.tick); }
      st.classList.remove("is-ringing", "is-live"); st.classList.add("is-ended"); st.removeAttribute("data-speaker");
      state.textContent = title; sub.textContent = detail;
      setTalk("again"); pauseBtn.hidden = false; pauseBtn.innerHTML = ICON_PLAY; pauseBtn.setAttribute("aria-label", "Back to the example calls");
    }

    function ended() {
      if (!live || live.ended) return;
      if (!live.t0) { fail("Kate's busy right now", "Please try again in a minute."); return; }
      live.ended = true; clearInterval(live.tick);
      st.classList.remove("is-live", "is-ringing"); st.classList.add("is-ended"); st.removeAttribute("data-speaker");
      var s = live.t0 ? Math.floor((Date.now() - live.t0) / 1000) : 0;
      state.textContent = "Call ended" + (s ? " after " + Math.floor(s / 60) + ":" + ("0" + (s % 60)).slice(-2) : "");
      sub.textContent = "Demo only. Nothing was saved.";
      smsTitle.textContent = "That's the demo";
      smsBody.textContent = "For your business, this call would now be summarised in your call log, and urgent ones texted to your on-call phone.";
      setTimeout(function () { if (live && live.ended) sms.classList.add("show"); }, 600);
      setTimeout(function () { if (live && live.ended) sms.classList.remove("show"); }, 9000);
      setTalk("again"); pauseBtn.hidden = false; pauseBtn.innerHTML = ICON_PLAY; pauseBtn.setAttribute("aria-label", "Back to the example calls");
    }

    function startLive() {
      if (live && !live.ended) return;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { stopExamples(); live = { ended: true }; fail("This browser can't use a microphone", "Try Chrome, Safari or Edge on a phone or computer."); return; }
      stopExamples();
      live = { conv: null, mode: "listening", t0: 0, ended: false };
      var me = live;
      st.classList.add("is-ringing");
      chip.textContent = "Live demo"; time.textContent = "0:00";
      state.textContent = "Calling Kate"; sub.textContent = "Allow the microphone when your browser asks";
      setTalk("wait");
      if (st.getBoundingClientRect().top < 0) st.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });

      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        if (me !== live || me.ended) return;
        sub.textContent = "Connecting";
        return import(SDK).then(function (mod) {
          if (me !== live || me.ended) return;
          return mod.Conversation.startSession({
            agentId: AGENT_ID,
            connectionType: "websocket",
            onConnect: function () {
              if (me !== live) return;
              me.t0 = Date.now(); me.tick = setInterval(clock, 500);
              st.classList.remove("is-ringing"); st.classList.add("is-live");
              state.textContent = "Talking with Kate"; sub.textContent = "Play a guest. Speak naturally, interrupt any time.";
              setTalk("end"); wake();
            },
            onMessage: function (m) {
              if (me !== live) return;
              var r = m.role || m.source;
              say(r === "agent" || r === "ai" ? "ai" : "caller", m.message);
            },
            onModeChange: function (m) { if (me === live) { me.mode = m.mode; wake(); } },
            onDisconnect: function () { if (me === live) ended(); },
            onError: function (msg) { if (window.console) console.warn("Keel Co demo:", msg); }
          }).then(function (conv) {
            if (me !== live || me.ended) { try { conv.endSession(); } catch (e) {} return; }
            me.conv = conv; wake();
          });
        });
      }).catch(function (err) {
        if (me !== live) return;
        var denied = err && (err.name === "NotAllowedError" || err.name === "SecurityError" || err.name === "NotFoundError");
        if (denied) fail("Microphone not available", "Allow microphone access for this site, then try again.");
        else fail("Kate's busy right now", "Please try again in a minute.");
      });
    }

    function onTalk(e) {
      if (e) e.preventDefault();
      if (live && !live.ended) { if (live.conv) live.conv.endSession(); else fail("Call cancelled", "Tap Talk again whenever you're ready."); return; }
      startLive();
    }
    if (talkBtn) talkBtn.addEventListener("click", onTalk);
    hostBtns.forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); st.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" }); if (!live || live.ended) startLive(); }); });
    window.addEventListener("pagehide", function () { if (live && live.conv) try { live.conv.endSession(); } catch (e) {} });
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
