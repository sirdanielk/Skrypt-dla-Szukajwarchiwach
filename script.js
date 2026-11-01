
// ==UserScript==
// @name         Szukaj w Archiwach - Better Scan Control + Polish Default
// @namespace    swa-better-scan
// @version      5.0.0
// @description  Precyzyjny zoom i przesuwanie skanów i język polski
// @match        https://www.szukajwarchiwach.gov.pl/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const CFG = {
        selector: 'section.ps-photo figure.zoom',
        zoomStep: 1.12,
        minZoom: 10,
        maxZoom: 250,
        dragSensitivity: 1
    };

    let activeFigure = null;
    let dragging = false;
    let pointerId = null;
    let lastX = 0;
    let lastY = 0;

    function getFigure(target) {
        if (!(target instanceof Element)) return null;
        return target.closest(CFG.selector);
    }

function readState(f) {
    const css = getComputedStyle(f);

    const percentage = parseFloat(css.backgroundSize);

    const x = parseFloat(css.backgroundPositionX) || 0;
    const y = parseFloat(css.backgroundPositionY) || 0;

    if (!Number.isFinite(percentage)) return null;

    return { percentage, x, y };
}

    function getDimensions(f, percentage) {
        const width = f.clientWidth;
        const height = f.clientHeight;

        const img = f.querySelector('img');
        const naturalWidth = img?.naturalWidth || 1;
        const naturalHeight = img?.naturalHeight || 1;

        const imageWidth = width * percentage / 100;
        const imageHeight = imageWidth * naturalHeight / naturalWidth;

        return {
            width,
            height,
            imageWidth,
            imageHeight
        };
    }


function limitPosition(f, state) {
    const d = getDimensions(f, state.percentage);
    const margin = 30;

    state.x = Math.max(
        margin - d.imageWidth,
        Math.min(d.width - margin, state.x)
    );

    state.y = Math.max(
        margin - d.imageHeight,
        Math.min(d.height - margin, state.y)
    );

    return state;
}


    function apply(f, state) {
        state = limitPosition(f, state);

        f.style.backgroundSize =
            `${state.percentage}% auto`;

        f.style.backgroundPosition =
            `${state.x}px ${state.y}px`;
    }

function zoom(f, factor, mouseX, mouseY) {
    const state = readState(f);
    if (!state) return;

    const next = Math.max(
        CFG.minZoom,
        Math.min(CFG.maxZoom, state.percentage * factor)
    );

    if (next === state.percentage) return;

    const rect = f.getBoundingClientRect();

    const px = mouseX - rect.left;
    const py = mouseY - rect.top;

    const ratio = next / state.percentage;

    state.x = px - (px - state.x) * ratio;
    state.y = py - (py - state.y) * ratio;

    state.percentage = next;

    apply(f, state);
}


    function onWheel(e) {
        const f = getFigure(e.target);
        if (!f) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        activeFigure = f;

        zoom(
    f,
    e.deltaY < 0 ? CFG.zoomStep : 1 / CFG.zoomStep,
    e.clientX,
    e.clientY
);
    }

    function onPointerDown(e) {
        const f = getFigure(e.target);

        if (!f || e.button !== 0) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        activeFigure = f;
        dragging = true;
        pointerId = e.pointerId;

        lastX = e.clientX;
        lastY = e.clientY;

        try {
            f.setPointerCapture(pointerId);
        } catch (_) {}

        f.style.cursor = 'grabbing';
    }

    function onPointerMove(e) {
        if (!dragging || e.pointerId !== pointerId) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const f = activeFigure;
        if (!f || !f.isConnected) {
            stopDragging();
            return;
        }

        const state = readState(f);
        if (!state) return;

        state.x += (e.clientX - lastX) * CFG.dragSensitivity;
        state.y += (e.clientY - lastY) * CFG.dragSensitivity;

        lastX = e.clientX;
        lastY = e.clientY;

        apply(f, state);
    }

    function stopDragging(e) {
        if (!dragging) return;

        if (e && e.pointerId !== pointerId) return;

        const f = activeFigure;

        dragging = false;
        pointerId = null;

        if (f) f.style.cursor = 'grab';
    }

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', stopDragging, true);
    document.addEventListener('pointercancel', stopDragging, true);

    document.addEventListener('wheel', onWheel, {
        capture: true,
        passive: false
    });

    document.addEventListener('dragstart', e => {
        if (getFigure(e.target)) {
            e.preventDefault();
            e.stopImmediatePropagation();
        }
    }, true);

    window.addEventListener('blur', () => stopDragging());

    function initialize() {
        const f = document.querySelector(CFG.selector);

        if (!f || f === activeFigure) return;

        activeFigure = f;
        f.draggable = false;
        f.style.cursor = 'grab';
        f.style.userSelect = 'none';

        const img = f.querySelector('img');
        if (img) {
            img.draggable = false;
            img.style.pointerEvents = 'none';
            img.style.userSelect = 'none';
        }
    }

    const observer = new MutationObserver(initialize);

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    initialize();

    function forcePolish() {
        const endpoint = '/c/portal/update_language';

        function fixLanguageUrl(url) {
            const u = new URL(url, location.origin);

            if (!u.pathname.includes(endpoint)) return null;

            u.searchParams.set('languageId', 'pl_PL');

            const redirect = u.searchParams.get('redirect');

            if (redirect) {
                const fixedRedirect = redirect.replace(
                    /^\/(en|de|fr|ru|uk|es|it|cs|sk|lt|et|hu)(?=\/)/i,
                    ''
                );

                u.searchParams.set('redirect', fixedRedirect);
            }

            return u.href;
        }

        document.addEventListener('click', function(e) {
            const a = e.target.closest('a[href*="/c/portal/update_language"]');

            if (!a) return;

            const fixed = fixLanguageUrl(a.href);

            if (fixed) {
                a.href = fixed;
            }
        }, true);

        function fixAllLinks() {
            document.querySelectorAll('a[href*="/c/portal/update_language"]')
                .forEach(a => {
                    const fixed = fixLanguageUrl(a.href);
                    if (fixed) a.href = fixed;
                });
        }

        fixAllLinks();

        new MutationObserver(fixAllLinks).observe(
            document.documentElement,
            { childList: true, subtree: true }
        );

        const match = location.pathname.match(
            /^\/(en|de|fr|ru|uk|es|it|cs|sk|lt|et|hu)(?=\/)/i
        );

        if (match) {
            const link = document.querySelector(
                'a[href*="/c/portal/update_language"]'
            );

            if (link) {
                const url = new URL(
                    fixLanguageUrl(link.href)
                );

                const polishPath = location.pathname.replace(
                    /^\/[a-z]{2}(?=\/)/i,
                    ''
                );

                url.searchParams.set(
                    'redirect',
                    polishPath + location.search + location.hash
                );

                location.replace(url.href);
            }
        }
    }

    forcePolish();

})();
