
/**
 * Интеграция с mFilter2
 */
(function () {
    "use strict";

    const form = document.querySelector(".js-filters-form");
    if (!form) {
        return;
    }

    const $ = window.jQuery || window.$;

    if (typeof window.mSearch2 === "undefined" || typeof window.mse2Config === "undefined") {
        return;
    }

    const wrapperSelector = mSearch2.options && mSearch2.options.wrapper ? mSearch2.options.wrapper : "#mse2_mfilter";
    const paginationLinkSelector = mSearch2.options && mSearch2.options.pagination_link ? mSearch2.options.pagination_link : ".mse2_pagination a";
    const moreSelector = mSearch2.options && mSearch2.options.more ? mSearch2.options.more : ".btn_more";

    if (!mSearch2.initialized) {
        try {
            mSearch2.initialize(wrapperSelector);
        } catch (e) {
        }
    }

    const FIELD_MAP = {
        kindtour:    "kindtour",
        typetour:    "typetour",
        dates:       "dates",
        price:       "price",
        duration:    "duration",
        prepay:      "prepay",
        discount:    "discount",
        recommend:   "recommend",
        sort:        "sort",
    };

    const CONTROLLED_KEYS = Object.keys(FIELD_MAP);

    const nativeGetFilters = (typeof mSearch2.getFilters === "function")
        ? mSearch2.getFilters.bind(mSearch2)
        : null;

    function normalizeKey(rawKey) {
        return rawKey.replace(/\[\]$/, "");
    }

    function buildParamsFromForm() {
        let params = {};

        if (nativeGetFilters) {
            params = nativeGetFilters() || {};
        }

        // 1) чистим всё, чем управляет js-filters-form
        Object.keys(params).forEach(function (k) {
            if (k.startsWith("_")) {
                return;
            }
            const base = normalizeKey(k);
            if (
                CONTROLLED_KEYS.indexOf(base) !== -1 ||
                CONTROLLED_KEYS.some(function (name) {
                    return k === name || k.indexOf(name + "[") === 0;
                })
            ) {
                delete params[k];
            }
        });

        const fd = new FormData(form);
        const priceRange = { min: null, max: null };
        let hasPriceRange = false;

        // 2) накладываем значения из js-filters-form
        fd.forEach(function (value, rawKey) {
            if (value == null || value === "" || rawKey.startsWith("_")) {
                return;
            }

            // dates[start]/dates[end] игнорируем здесь, соберём ниже
            if (rawKey.indexOf("dates[") === 0) {
                return;
            }

            // price[min]/price[max] собираем в диапазон
            if (rawKey.indexOf("price[") === 0) {
                const m = rawKey.match(/^price\[(min|max)\]$/);
                if (m) {
                    priceRange[m[1]] = value;
                    hasPriceRange = true;
                }
                return;
            }

            const baseKey = normalizeKey(rawKey);
            const mfKey = FIELD_MAP[baseKey] || baseKey;

            if (!mfKey) {
                return;
            }

            if (params[mfKey]) {
                params[mfKey] += mse2Config["values_delimeter"] + value;
            } else {
                params[mfKey] = value;
            }
        });

        // 3) dates: "YYYY-MM-DD – YYYY-MM-DD" или один день
        const datesInputStart = form.querySelector('input[name="dates[start]"]');
        const datesInputEnd = form.querySelector('input[name="dates[end]"]');
        if (datesInputStart && datesInputEnd && $) {
            const datesStartValue = datesInputStart.value;
            const datesEndValue = datesInputEnd.value;
            if (datesStartValue || datesEndValue) {
                if (datesStartValue && datesEndValue && datesStartValue !== datesEndValue) {
                    params["dates"] = datesStartValue + " – " + datesEndValue;
                } else {
                    params["dates"] = datesStartValue || datesEndValue;
                }
            }
        }

        // 4) price: одно поле с разделителем
        if (hasPriceRange) {
            const delim = mse2Config["values_delimeter"] || "||";
            const parts = [];
            if (priceRange.min != null && priceRange.min !== "") {
                parts.push(priceRange.min);
            }
            if (priceRange.max != null && priceRange.max !== "") {
                parts.push(priceRange.max);
            }
            if (parts.length) {
                params["price"] = parts.join(delim);
            }
        }

        // 5) name[] → name с values_delimeter
        Object.keys(params).forEach(function (k) {
            if (k.startsWith("_")) {
                return;
            }
            if (/\[\]$/.test(k)) {
                const base = normalizeKey(k);
                const mfKey = FIELD_MAP[base] || base;
                if (!mfKey) {
                    delete params[k];
                    return;
                }
                if (params[mfKey]) {
                    params[mfKey] += mse2Config["values_delimeter"] + params[k];
                } else {
                    params[mfKey] = params[k];
                }
                delete params[k];
            }
        });

        return params;
    }

    function submitAjax() {
        // как в mSearch2.submit: при смене фильтров сбрасываем страницу
        if (typeof mse2Config.page !== "undefined") {
            mse2Config.page = "";
        }

        let params = buildParamsFromForm();

        delete params.page;

        if (mSearch2.Hash && typeof mSearch2.Hash.set === "function") {
            mSearch2.Hash.set(params);
        }

        mSearch2.load(params);
    }

    // Любые изменения формы триггерят фильтрацию
    form.addEventListener("change", function () {
        submitAjax();
    });

    // Работаем с пагинацией
    function loadNextPageWithForm() {
        const pcre = new RegExp(mse2Config["pageVar"] + "[=|\\/|-](\\d+)");
        const current = mse2Config["page"] || 1;
        let nextPage = null;

        $(paginationLinkSelector).each(function () {
            const href = $(this).prop("href");
            if (!href) {
                return;
            }
            const match = href.match(pcre);
            const page = !match ? 1 : Number(match[1]);
            if (page > current) {
                nextPage = page;
                return false;
            }
        });

        if (!nextPage) {
            return;
        }

        mse2Config["page"] = (nextPage !== mse2Config["start_page"]) ? nextPage : "";

        const hashParams = buildParamsFromForm();
        delete hashParams.page;
        if (mSearch2.Hash && typeof mSearch2.Hash.set === "function") {
            mSearch2.Hash.set(hashParams);
        }

        const params = buildParamsFromForm();
        if (mse2Config["page"]) {
            params.page = mse2Config["page"];
        } else {
            delete params.page;
        }

        mSearch2.load(params, null, true);
    }

    $(document).off("click", wrapperSelector + " " + moreSelector);
    $(document).on("click", wrapperSelector + " " + moreSelector, function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();
        loadNextPageWithForm();
        return false;
    });

    $(document).off("click", paginationLinkSelector);
    $(document).on("click", paginationLinkSelector, function (e) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const href = $(this).prop("href") || "";
        const pcre = new RegExp(mse2Config["pageVar"] + "[=|\\/|-](\\d+)");
        const match = href.match(pcre);
        const page = match && match[1] ? Number(match[1]) : 1;

        mse2Config["page"] = (page !== mse2Config["start_page"]) ? page : "";

        const hashParams = buildParamsFromForm();
        delete hashParams.page;
        if (mSearch2.Hash && typeof mSearch2.Hash.set === "function") {
            mSearch2.Hash.set(hashParams);
        }

        const params = buildParamsFromForm();
        if (mse2Config["page"]) {
            params.page = mse2Config["page"];
        } else {
            delete params.page;
        }

        mSearch2.load(params, function () {
            $("html, body").animate({
                scrollTop: $(mSearch2.options.wrapper).position().top || 0
            }, 0);
        });

        return false;
    });

    const debugBucket = window.FiltersDebugForm || {};
    debugBucket.submitAjax = submitAjax;
    window.FiltersDebugForm = debugBucket;
})();





/**
 * Полный функционал ExtraGuide Filters
 */
(function () {
    "use strict";

    const isMobile = () => window.matchMedia("(max-width:768px)").matches;

    const filters = document.getElementById("filters");
    const submitAjax = window.FiltersDebugForm?.submitAjax ?? (() => {});
    const isModalActive = () => document.body.classList.contains("filters-modal");

    const MONTHS_NOMINATIVE = [
        "январь", "февраль", "март", "апрель", "май", "июнь",
        "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"
    ];
    const MONTHS_GENITIVE = [
        "янв", "фев", "мар", "апр", "мая", "июн",
        "июл", "авг", "сен", "окт", "ноя", "дек"
    ];
    const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

    const clampToDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
    const addMonths = (date, diff) => {
        const next = new Date(date.getFullYear(), date.getMonth(), 1);
        next.setMonth(next.getMonth() + diff);
        return next;
    };
    const addDays = (date, diff) => {
        const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        next.setDate(next.getDate() + diff);
        return next;
    };
    const parseISODate = (value) => {
        if (!value || typeof value !== "string") return null;
        const trimmed = value.trim();
        const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!match) return null;
        const year = Number(match[1]);
        const month = Number(match[2]) - 1;
        const day = Number(match[3]);
        const date = new Date(year, month, day);
        if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
            return null;
        }
        return date;
    };
    const toISODate = (date) => {
        if (!(date instanceof Date)) return "";
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");
        return `${year}-${month}-${day}`;
    };
    const isSameDay = (a, b) => {
        if (!(a instanceof Date) || !(b instanceof Date)) return false;
        return a.getFullYear() === b.getFullYear() &&
            a.getMonth() === b.getMonth() &&
            a.getDate() === b.getDate();
    };
    const isDayBetween = (target, start, end) => {
        if (!(target instanceof Date) || !(start instanceof Date) || !(end instanceof Date)) return false;
        const t = target.getTime();
        const s = start.getTime();
        const e = end.getTime();
        if (s <= e) {
            return t >= s && t <= e;
        }
        return t >= e && t <= s;
    };
    const formatMonthTitle = (date) => {
        const month = MONTHS_NOMINATIVE[date.getMonth()] || "";
        const capitalized = month ? (month.charAt(0).toUpperCase() + month.slice(1)) : "";
        return `${capitalized} ${date.getFullYear()}`.trim();
    };
    const formatDateHuman = (date) => {
        if (!(date instanceof Date)) return "";
        return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
    };
    const formatRangeHuman = (start, end) => {
        if (!(start instanceof Date) || !(end instanceof Date)) return "";
        const sameDay = isSameDay(start, end);
        if (sameDay) {
            return `${formatDateHuman(start)} ${start.getFullYear()}`;
        }
        const sameYear = start.getFullYear() === end.getFullYear();
        if (sameYear) {
            if (start.getMonth() === end.getMonth()) {
                return `${start.getDate()} – ${end.getDate()} ${MONTHS_GENITIVE[end.getMonth()]} ${end.getFullYear()}`;
            }
            return `${formatDateHuman(start)} – ${formatDateHuman(end)} ${end.getFullYear()}`;
        }
        return `${formatDateHuman(start)} ${start.getFullYear()} – ${formatDateHuman(end)} ${end.getFullYear()}`;
    };

    let currentOpen = null;
    let overlayEl = null;
    let overlayMouseDown = false;
    let ghostEl = null;

    const lockScrollBody = (on) => {
        document.documentElement.style.overflow = on ? "hidden" : "";
    };
    const ensureOverlay = () => {
        if (!overlayEl) {
            overlayEl = document.createElement("div");
            overlayEl.className = "exs-overlay";

            overlayEl.addEventListener("mousedown", () => {
                overlayMouseDown = true;
            }, { capture: true });

            overlayEl.addEventListener("mouseup", () => {
                if (overlayMouseDown) {
                    if (currentOpen) currentOpen.close();
                }
                overlayMouseDown = false;
            }, { capture: true });

            document.addEventListener("mouseup", (e) => {
                if (e.target !== overlayEl) overlayMouseDown = false;
            }, { capture: true });

            document.body.appendChild(overlayEl);
        }
    };
    const moveOverlayOnTop = () => {
        if (overlayEl) {
            overlayEl.remove();
            document.body.appendChild(overlayEl);
        }
    };
    const removeOverlay = () => {
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
        overlayMouseDown = false;
    };

    function sanitizeGhost(root) {
        root.querySelectorAll(".exs-hidden").forEach(n => n.remove());
        const removeJsClasses = (el) => {
            if (el.classList && el.classList.length) {
                [...el.classList].forEach(cls => {
                    if (cls.startsWith("js-")) {
                        el.classList.remove(cls);
                    }
                });
            }
        };
        removeJsClasses(root);
        root.querySelectorAll("*").forEach(el => removeJsClasses(el));
        root.querySelectorAll("input, select, textarea, button").forEach(el => {
            el.removeAttribute("name");
            el.setAttribute("disabled", "disabled");
            el.setAttribute("tabindex", "-1");
            el.removeAttribute("aria-controls");
            el.removeAttribute("aria-owns");
        });
        root.querySelectorAll("[id]").forEach(el => el.removeAttribute("id"));
        root.querySelectorAll(".exs-popover").forEach(p => p.setAttribute("hidden", ""));
        root.setAttribute("aria-hidden", "true");
    }
    function createGhost() {
        if (ghostEl) return;
        const bodyNode = filters.querySelector(".filters-body");
        if (!bodyNode) return;
        ghostEl = document.createElement("div");
        ghostEl.className = "filters-ghost";
        const clone = bodyNode.cloneNode(true);
        sanitizeGhost(clone);
        ghostEl.appendChild(clone);
        filters.parentNode.insertBefore(ghostEl, filters);
    }
    function removeGhost() {
        if (!ghostEl) return;
        ghostEl.remove();
        ghostEl = null;
    }

    function portalOpen(pop, trigger) {
        const placeholder = document.createComment("exs-portal-placeholder");
        pop.parentNode.insertBefore(placeholder, pop);
        document.body.appendChild(pop);

        let cleanupPos = () => {};
        if (!isMobile()) {
            const applyPos = () => {
                const rect = trigger.getBoundingClientRect();
                const style = pop.style;
                style.position = "fixed";
                style.top = (rect.bottom + 6) + "px";
                style.width = rect.width + "px";
                style.right = "auto";
                style.bottom = "auto";
                style.zIndex = 11000;
                style.opacity = "1";
                style.transform = "translateY(0)";

                const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
                const viewportPadding = 12;
                const popWidth = pop.offsetWidth;
                const maxLeft = viewportWidth - viewportPadding - popWidth;
                let left = rect.left;
                if (Number.isFinite(maxLeft)) {
                    left = Math.min(left, maxLeft);
                }
                if (left < viewportPadding) {
                    left = viewportPadding;
                }
                style.left = `${left}px`;
            };
            applyPos();
            const onScrollResize = () => applyPos();
            window.addEventListener("scroll", onScrollResize, true);
            window.addEventListener("resize", onScrollResize);
            cleanupPos = () => {
                window.removeEventListener("scroll", onScrollResize, true);
                window.removeEventListener("resize", onScrollResize);
                const style = pop.style;
                style.position = "";
                style.left = "";
                style.top = "";
                style.width = "";
                style.right = "";
                style.bottom = "";
                style.opacity = "";
                style.transform = "";
                style.transition = "";
            };
        }
        const restore = () => {
            cleanupPos();
            if (placeholder.parentNode) {
                placeholder.parentNode.insertBefore(pop, placeholder);
                placeholder.remove();
            }
        };
        return { restore };
    }

    function animateFromTo(pop, fromY, toY, duration = 180, easing = "ease", onEnd) {
        pop.style.animation = "";
        pop.dataset.open = "";
        pop.dataset.closing = "";
        pop.style.transition = "none";
        pop.style.transform = `translateY(${fromY}px)`;
        requestAnimationFrame(() => {
            pop.style.transition = `transform ${duration}ms ${easing}`;
            requestAnimationFrame(() => {
                pop.style.transform = (typeof toY === "string") ? toY : `translateY(${toY}px)`;
            });
        });
        const handler = (e) => {
            if (e.propertyName !== "transform") return;
            pop.removeEventListener("transitionend", handler);
            pop.style.transition = "";
            onEnd && onEnd();
        };
        pop.addEventListener("transitionend", handler);
    }
    function startKeyframe(pop, kind ) {
        pop.style.animation = "";
        pop.style.transform = "";
        void pop.offsetWidth;
        if (kind === "open") {
            pop.dataset.closing = "";
            pop.dataset.open = "true";
        } else {
            pop.dataset.open = "";
            pop.dataset.closing = "true";
        }
    }
    function desktopFadeOut(pop, done) {
        pop.style.transition = "opacity 140ms ease, transform 140ms ease";
        let finished = false;
        const clear = () => {
            if (finished) return;
            finished = true;
            pop.style.transition = "";
            pop.style.opacity = "";
            pop.style.transform = "";
            done && done();
        };
        requestAnimationFrame(() => {
            pop.style.opacity = "0";
            pop.style.transform = "translateY(-4px)";
        });
        const onEnd = (e) => {
            if (e.target !== pop) return;
            pop.removeEventListener("transitionend", onEnd);
            clear();
        };
        pop.addEventListener("transitionend", onEnd);
        setTimeout(clear, 180);
    }

    const RUBBER_K = 160;
    const VSLACK = 40;
    const BASE_PULL = 125;
    const MAX_UP_ACTUAL = BASE_PULL * Math.exp(-VSLACK / RUBBER_K);
    function rubberUpShifted(pull) {
        const eV = Math.exp(-VSLACK / RUBBER_K);
        const val = BASE_PULL * eV * (1 - Math.exp(-pull / RUBBER_K));
        return Math.min(val, MAX_UP_ACTUAL);
    }

    function attachSwipe(pop, api) {
        if (!isMobile()) return () => {};

        const scrollable = pop.querySelector(".exs-body") || pop;
        const isSwipeLocked = (target) => Boolean(target && target.closest(".js-exs-swipe-lock"));
        const setSheetDragMeta = (active, distance = 0) => {
            if (active) {
                pop.dataset.sheetDragging = "true";
                if (distance > 0) {
                    pop.dataset.sheetDragDistance = String(distance);
                } else {
                    delete pop.dataset.sheetDragDistance;
                }
            } else {
                delete pop.dataset.sheetDragging;
                delete pop.dataset.sheetDragDistance;
            }
        };
        const updateSheetDragDistance = (distance) => {
            if (pop.dataset.sheetDragging === "true") {
                if (distance > 0) {
                    pop.dataset.sheetDragDistance = String(distance);
                } else {
                    delete pop.dataset.sheetDragDistance;
                }
            }
        };
        const abortSwipeGesture = () => {
            started = false;
            dragging = false;
            dy = 0;
            if (rafId != null) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
            setSheetDragMeta(false);
        };

        let started = false, dragging = false;
        let y0 = 0, dy = 0, rafId = null;

        const THRESH = 6;
        const clampSheet = (y) => {
            const maxDown = window.innerHeight * 0.85;
            const minUp = -MAX_UP_ACTUAL;
            return Math.max(minUp, Math.min(y, maxDown));
        };
        const applyY = (y) => { pop.style.transform = `translateY(${clampSheet(y)}px)`; };
        const onFrame = () => { rafId = null; applyY(dy); };

        const tryStart = (clientY) => {
            started = true;
            dragging = false;
            y0 = clientY;
            dy = 0;
            pop.style.animation = "none";
            pop.dataset.open = "";
            pop.dataset.closing = "";
            pop.style.transition = "none";
            setSheetDragMeta(false);
        };

        const onMoveCore = (clientY, e) => {
            if (!started) return;
            const delta = clientY - y0;
            const distance = delta < 0 ? Math.max(0, -delta) : delta;

            if (!dragging) {
                if (delta < -THRESH && scrollable.scrollTop <= 0) { dragging = true; setSheetDragMeta(true, distance); }
                else if (delta > THRESH) { dragging = true; setSheetDragMeta(true, distance); }
                else { return; }
            } else {
                updateSheetDragDistance(distance);
            }

            if (delta < 0 && scrollable.scrollTop <= 0) {
                const pull = Math.max(0, -delta);
                dy = -rubberUpShifted(pull);
                if (e && e.cancelable) e.preventDefault();
                if (rafId == null) rafId = requestAnimationFrame(onFrame);
                return;
            }

            if (delta >= 0) {
                dy = delta;
                if (e && e.cancelable) e.preventDefault();
                if (rafId == null) rafId = requestAnimationFrame(onFrame);
                return;
            }
        };

        const endCore = () => {
            if (!started) return;
            started = false;

            if (dragging) {
                cancelAnimationFrame(rafId); rafId = null;

                if (dy > 0) {
                    const threshold = 40;
                    const currentY = clampSheet(dy);
                    if (currentY > threshold) {
                        animateFromTo(pop, currentY, "translateY(100%)", 180, "ease", () => {
                            api.close({ animatedFromY: null, alreadyAnimated: true });
                        });
                    } else {
                        animateFromTo(pop, currentY, 0, 180, "ease", () => {
                            pop.style.transform = "";
                            pop.style.animation = "";
                        });
                    }
                } else {
                    const currentY = clampSheet(dy);
                    animateFromTo(pop, currentY, 0, 160, "cubic-bezier(.2,.8,.2,1)", () => {
                        pop.style.transform = "";
                        pop.style.animation = "";
                    });
                }
            }

            dragging = false;
            dy = 0;
            setSheetDragMeta(false);
        };

        pop.addEventListener("pointerdown", (e) => {
            if (e.pointerType !== "touch") {
                return;
            }
            if (isSwipeLocked(e.target)) {
                abortSwipeGesture();
                return;
            }
            tryStart(e.clientY);
        }, { passive: true });
        pop.addEventListener("pointermove", (e) => onMoveCore(e.clientY, e), { passive: false });
        pop.addEventListener("pointerup", endCore, { passive: true });
        pop.addEventListener("pointercancel", endCore, { passive: true });

        pop.addEventListener("touchstart", (e) => {
            const touch = e.touches[0];
            if (!touch) {
                return;
            }
            if (isSwipeLocked(e.target)) {
                abortSwipeGesture();
                return;
            }
            tryStart(touch.clientY);
        }, { passive: true });
        pop.addEventListener("touchmove", (e) => onMoveCore(e.touches[0].clientY, e), { passive: false });
        pop.addEventListener("touchend", endCore, { passive: true });
        pop.addEventListener("touchcancel", endCore, { passive: true });

        return () => {};
    }

    (function outsideClickOnly() {
        const handler = (e) => {
            if (!currentOpen) return;
            const { pop, root, trigger } = currentOpen;
            if (pop.contains(e.target) || root.contains(e.target) || trigger.contains(e.target)) return;
            currentOpen.close();
            e.stopPropagation();
        };
        // document.addEventListener("click", handler, true);
    })();

    const filtersOpenBadge = document.querySelector(".js-filters-open-badge");
    const standaloneChecks = [...document.querySelectorAll(".js-filters-standalone-checks input[type=\"checkbox\"]")];
    const extraSelectRegistry = new Map();
    const standaloneFieldRegistry = new Map();

    const updateFiltersBadge = () => {
        if (!filtersOpenBadge) {
            return;
        }
        let count = 0;
        extraSelectRegistry.forEach((api) => {
            if (typeof api.isActive === "function" && api.isActive()) {
                if (api.field !== 'sort') {
                    count += 1;
                }
            }
        });
        standaloneFieldRegistry.forEach((api) => {
            if (typeof api.isActive === "function" && api.isActive()) {
                count += 1;
            }
        });
        filtersOpenBadge.textContent = String(count);
        filtersOpenBadge.classList.toggle("is-visible", count > 0);
    };

    standaloneChecks.forEach((checkbox) => {
        const type = (checkbox.type || "checkbox").trim();
        const field = (checkbox.name || "").trim();
        
        checkbox.addEventListener("change", () => {
            updateFiltersBadge();
        });
        
        standaloneFieldRegistry.set(checkbox, {
            field,
            type,
            commitFromUi: null,
            resetForAll: () => {
                checkbox.checked = false;
            },
            isActive: () => checkbox.checked
        });
    });

    const exsRoots = document.querySelectorAll(".js-extra-select");
    if (!exsRoots.length) {
        updateFiltersBadge();
        return;
    }

    exsRoots.forEach((root) => {
        const type = (root.dataset.type || "checkbox").trim();
        const field = (root.dataset.field || "").trim();
        const placeholder = (root.dataset.placeholder || "Выбрать…").trim();
        const maxChars = +root.dataset.maxLabelChars || 28;

        const btn = root.querySelector(".js-exs-trigger");
        const pop = document.getElementById("exs-popover-" + field);
        const body = root.querySelector(".js-exs-body") || (pop ? pop.querySelector(".js-exs-body") : null);
        const hiddenWrap = root.querySelector(".js-exs-hidden");
        const closeX = pop ? pop.querySelector(".js-exs-close") : null;
        const datesInput = pop ? pop.querySelector(".js-dates-input") : null;
        const datesCalendarWrap = pop ? pop.querySelector(".js-dates-picker") : null;

        let applied = [];
        let detachSwipe = null;
        let portalRestore = null;
        let hasActive = false;
        let defaultRadioValue = "";

        const setButtonText = (text) => {
            if (!btn) return;
            const labelHolder = btn.querySelector("[data-trigger-label]");
            if (labelHolder) {
                labelHolder.textContent = text;
            } else {
                btn.textContent = text;
            }
        };

        const makeLabel = (arr, maxChars) => {
            if (!arr.length) return "";
            let out = "";
            for (let i = 0; i < arr.length; i++) {
                const next = (out ? out + ", " : "") + arr[i];
                if (next.length > maxChars) return out ? (out + ", …") : "…";
                out = next;
            }
            return out;
        };

        const updateBtn = () => {
            if (!btn) return;

            let nextActive = false;

            if (type === "checkbox") {
                if (!applied.length) {
                    setButtonText(placeholder);
                    btn.classList.remove("is-active");
                    root.classList.remove("is-filled");
                } else {
                    setButtonText(makeLabel(applied, maxChars));
                    btn.classList.add("is-active");
                    root.classList.add("is-filled");
                    nextActive = true;
                }
            } else if (type === "range") {
                const min = Number(root.dataset.min ?? "0");
                const max = Number(root.dataset.max ?? "0");
                if (!applied.length || (applied[0] === "" && applied[1] === "")) {
                    setButtonText(placeholder);
                    btn.classList.remove("is-active");
                    root.classList.remove("is-filled");
                } else {
                    const [aRaw, bRaw] = applied;
                    const a = aRaw === "" ? min : Number(aRaw);
                    const b = bRaw === "" ? max : Number(bRaw);
                    if (a === min && b === max) {
                        setButtonText(placeholder);
                        btn.classList.remove("is-active");
                        root.classList.remove("is-filled");
                    } else {
                        let text = "";
                        if (a !== min && b !== max) text = `${a} – ${b}`;
                        else if (a !== min)         text = `от ${a}`;
                        else if (b !== max)         text = `до ${b}`;
                        setButtonText(text || placeholder);
                        if (text) {
                            btn.classList.add("is-active");
                            root.classList.add("is-filled");
                            nextActive = true;
                        } else {
                            btn.classList.remove("is-active");
                            root.classList.remove("is-filled");
                        }
                    }
                }
            } else if (type === "dates") {
                if (!applied.length || !applied[0] || !applied[1]) {
                    setButtonText(placeholder);
                    btn.classList.remove("is-active");
                    root.classList.remove("is-filled");
                    if (datesInput) {
                        datesInput.dataset.datespickerValue = "";
                        datesInput.value = "";
                    }
                } else {
                    const startDate = parseISODate(applied[0]);
                    const endDate = parseISODate(applied[1]);
                    if (startDate && endDate) {
                        const label = formatRangeHuman(startDate, endDate) || placeholder;
                        setButtonText(label);
                        if (label && label !== placeholder) {
                            btn.classList.add("is-active");
                            root.classList.add("is-filled");
                            nextActive = true;
                        } else {
                            btn.classList.remove("is-active");
                            root.classList.remove("is-filled");
                        }
                        if (datesInput) {
                            const isoRange = `${toISODate(startDate)} – ${toISODate(endDate)}`;
                            datesInput.dataset.datespickerValue = isoRange;
                            datesInput.value = label;
                        }
                    } else {
                        setButtonText(placeholder);
                        btn.classList.remove("is-active");
                        root.classList.remove("is-filled");
                        if (datesInput) {
                            datesInput.dataset.datespickerValue = "";
                            datesInput.value = "";
                        }
                    }
                }
            } else if (type === "radio") {
                const radios = pop ? [...pop.querySelectorAll('input[type="radio"]')] : [];
                let val = "";
                const h = hiddenWrap ? hiddenWrap.querySelector('input[type="hidden"][name="sort"]') : null;
                if (h && h.value) {
                    val = h.value;
                } else {
                    const ch = radios.find(r => r.checked);
                    if (ch) val = ch.value;
                }
                const current = radios.find(r => r.value === val) || radios[0];
                const labelText =
                    (current?.dataset?.label || "").trim() ||
                    current?.closest("label")?.textContent?.trim() ||
                    current?.value || "";
                setButtonText(labelText || placeholder);
                btn.classList.add("is-active");
                nextActive = Boolean(current?.value) && current.value !== defaultRadioValue;
                root.classList.remove("is-filled");
            } else if (type === "stub") {
                setButtonText(placeholder);
                root.classList.remove("is-filled");
            } else {
                root.classList.remove("is-filled");
            }
            hasActive = nextActive;
            updateFiltersBadge();
        };

        const writeHidden = () => {
            if (!hiddenWrap) return;

            if (type === "checkbox") {
                hiddenWrap.innerHTML = "";
                applied.forEach(v => {
                    const h = document.createElement("input");
                    h.type = "hidden";
                    h.name = field + "[]";
                    h.value = v;
                    hiddenWrap.appendChild(h);
                });
                return;
            }

            if (type === "range") {
                // hiddenWrap.innerHTML = "";
                // if (applied[0]) {
                //     const h1 = document.createElement("input");
                //     h1.type = "hidden";
                //     h1.name = field + "[min]";
                //     h1.value = applied[0] ?? "";
                //     hiddenWrap.appendChild(h1);
                //     if (applied[1]) {
                //         const h2 = document.createElement("input");
                //         h2.type = "hidden";
                //         h2.name = field + "[max]";
                //         h2.value = applied[1] ?? "";
                //         hiddenWrap.appendChild(h2);
                //     }
                // }
                hiddenWrap.innerHTML = "";
                const dataMin = root.dataset.min ?? "";
                const dataMax = root.dataset.max ?? "";
                const appliedMin = applied[0] ?? "";
                const appliedMax = applied[1] ?? "";
                const isMinDefault = appliedMin === "" || appliedMin === dataMin;
                const isMaxDefault = appliedMax === "" || appliedMax === dataMax;
                if (isMinDefault && isMaxDefault) {
                    return;
                }
                const h1 = document.createElement("input");
                h1.type = "hidden";
                h1.name = field + "[min]";
                h1.value = appliedMin;
                const h2 = document.createElement("input");
                h2.type = "hidden";
                h2.name = field + "[max]";
                h2.value = appliedMax;
                hiddenWrap.appendChild(h1);
                hiddenWrap.appendChild(h2);
                return;
            }

            if (type === "dates") {
                hiddenWrap.innerHTML = "";
                const h1 = document.createElement("input");
                h1.type = "hidden";
                h1.name = field + "[start]";
                h1.value = applied[0] ?? "";
                const h2 = document.createElement("input");
                h2.type = "hidden";
                h2.name = field + "[end]";
                h2.value = applied[1] ?? "";
                hiddenWrap.appendChild(h1);
                hiddenWrap.appendChild(h2);
                return;
            }

            if (type === "radio") {
                const h = hiddenWrap.querySelector('input[type="hidden"][name="sort"]');
                if (h) h.value = applied[0] ?? h.value ?? "";
                return;
            }
        };

        const readHidden = () => {
            if (!hiddenWrap) { applied = []; return; }

            if (type === "checkbox") {
                applied = [...hiddenWrap.querySelectorAll(`input[type="hidden"][name="${field}[]"]`)].map(h => h.value);
                return;
            }

            if (type === "range") {
                const h1 = hiddenWrap.querySelector(`input[type="hidden"][name="${field}[min]"]`);
                const h2 = hiddenWrap.querySelector(`input[type="hidden"][name="${field}[max]"]`);
                applied = [(h1?.value ?? ""), (h2?.value ?? "")];
                return;
            }

            if (type === "dates") {
                const h1 = hiddenWrap.querySelector(`input[type="hidden"][name="${field}[start]"]`);
                const h2 = hiddenWrap.querySelector(`input[type="hidden"][name="${field}[end]"]`);
                applied = [(h1?.value ?? ""), (h2?.value ?? "")];
                return;
            }
            if (type === "radio") {
                const radios = pop ? [...pop.querySelectorAll('input[type="radio"]')] : [];
                const h = hiddenWrap.querySelector(`input[type="hidden"][name="sort"]`);
                let v = (h?.value || "");
                if (!v) {
                    const ch = radios.find(r => r.checked);
                    if (ch) v = ch.value;
                }
                applied = [v];
                return;
            }

            if (type === "stub") {
                applied = [];
            }
        };

        if (type === "checkbox") {
            const checks = body ? [...body.querySelectorAll('input[type="checkbox"]')] : [];

            const syncChecksFromApplied = () => {
                const set = new Set(applied);
                checks.forEach(c => { c.checked = set.has(c.value); });
            };

            const commitFromChecks = () => {
                applied = checks.filter(c => c.checked).map(c => c.value);
                writeHidden();
                updateBtn();
            };

            const commitFromModal = () => {
                if (!isModalActive()) {
                    return;
                }
                commitFromChecks();
            };

            const resetChecks = () => {
                checks.forEach(c => { c.checked = false; });
                applied = [];
                writeHidden();
                updateBtn();
            };

            const open = () => {
                if (currentOpen && currentOpen.root !== root) currentOpen.close();
                syncChecksFromApplied();
                if (pop) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
                const { restore } = portalOpen(pop, btn);
                portalRestore = restore;
                ensureOverlay(); moveOverlayOnTop(); lockScrollBody(true);
                if (isMobile()) {
                    startKeyframe(pop, "open");
                    detachSwipe = attachSwipe(pop, api);
                }
                currentOpen = { root, pop, trigger: btn, close: api.close };
                (checks.find(x => x.checked) || checks[0])?.focus();
            };

            const reallyHide = () => { if (pop) pop.hidden = true; };

            const close = (opts = {}) => {
                const { animatedFromY = null, alreadyAnimated = false } = opts;

                const finalize = () => {
                    removeOverlay(); lockScrollBody(false);
                    reallyHide();
                    if (portalRestore) { portalRestore(); portalRestore = null; }
                    btn.setAttribute("aria-expanded", "false");
                    if (currentOpen && currentOpen.root === root) currentOpen = null;
                };

                if (detachSwipe) { detachSwipe(); detachSwipe = null; }

                if (isMobile()) {
                    if (alreadyAnimated) {
                        finalize();
                    } else if (Number.isFinite(animatedFromY) && animatedFromY > 0) {
                        animateFromTo(pop, animatedFromY, "translateY(100%)", 180, "ease", finalize);
                    } else {
                        startKeyframe(pop, "close");
                        setTimeout(finalize, 180);
                    }
                    setTimeout(() => { pop.style.transform = ""; pop.style.animation = ""; }, 200);
                } else {
                    desktopFadeOut(pop, finalize);
                }
            };

            const trapFocus = (e) => {
                if (e.key !== "Tab") return;
                const f = pop.querySelectorAll("input,button,[tabindex]:not([tabindex='-1'])");
                if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };
            const onArrows = (e) => {
                if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
                const list = checks; const i = list.indexOf(document.activeElement);
                if (i === -1) return; e.preventDefault();
                const next = e.key === "ArrowDown" ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0);
                list[next].focus();
            };

            ["pointerdown", "mousedown", "touchstart", "click"].forEach(ev => {
                pop.addEventListener(ev, (ev2) => ev2.stopPropagation(), { passive: ev === "touchstart" });
            });

            btn.addEventListener("click", (e) => { e.stopPropagation(); (pop.hidden ? open : api.close)(); });
            btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (pop.hidden ? open : api.close)(); } });
            pop.addEventListener("keydown", trapFocus);
            pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } });
            pop.addEventListener("keydown", onArrows);
            closeX?.addEventListener("click", () => api.close());

            checks.forEach((checkbox) => {
                checkbox.addEventListener("change", commitFromModal);
            });

            pop.addEventListener("click", (e) => {
                const action = e.target?.dataset?.action;
                if (action === "reset") {
                    resetChecks();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
                if (action === "apply") {
                    commitFromChecks();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
            });

            readHidden();
            if (!applied.length) {
                const pre = checks.filter(c => c.checked).map(c => c.value);
                if (pre.length) {
                    applied = pre;
                    writeHidden();
                }
            }
            syncChecksFromApplied();
            updateBtn();

            var api = { root, pop, trigger: btn, close };
            extraSelectRegistry.set(root, {
                field,
                type,
                commitFromUi: commitFromChecks,
                resetForAll: resetChecks,
                isActive: () => hasActive
            });

        } else if (type === "dates") {
            const today = clampToDate(new Date());
            const minViewDate = startOfMonth(today);
            let stagedDates = [null, null];
            let viewDate = minViewDate;
            let hoverDate = null;
            let hasReadInitialDataset = false;
            const skipClickByIso = new Map();
            const SKIP_CLICK_WINDOW_MS = 1200;

            const armSkipForIso = (isoValue) => {
                const existing = skipClickByIso.get(isoValue);
                if (existing != null) {
                    clearTimeout(existing);
                }
                const timerId = setTimeout(() => {
                    if (skipClickByIso.get(isoValue) === timerId) {
                        skipClickByIso.delete(isoValue);
                    }
                }, SKIP_CLICK_WINDOW_MS);
                skipClickByIso.set(isoValue, timerId);
            };

            const clearSkipForIso = (isoValue) => {
                const timerId = skipClickByIso.get(isoValue);
                if (timerId != null) {
                    clearTimeout(timerId);
                    skipClickByIso.delete(isoValue);
                }
            };

            const shouldSkipClickForIso = (isoValue) => skipClickByIso.has(isoValue);

            const isDateInPast = (date) => {
                if (!(date instanceof Date)) return false;
                return date.getTime() < today.getTime();
            };

            const updateDisplayFromStaged = () => {
                if (!datesInput) return;
                const startSel = stagedDates[0];
                const endSel = stagedDates[1];
                if (startSel && endSel) {
                    let a = clampToDate(startSel);
                    let b = clampToDate(endSel);
                    if (b.getTime() < a.getTime()) [a, b] = [b, a];
                    const isoRange = `${toISODate(a)} – ${toISODate(b)}`;
                    datesInput.dataset.datespickerValue = isoRange;
                    datesInput.value = formatRangeHuman(a, b);
                } else if (startSel) {
                    const a = clampToDate(startSel);
                    const isoRange = toISODate(a);
                    datesInput.dataset.datespickerValue = isoRange;
                    datesInput.value = `${formatDateHuman(a)} ${a.getFullYear()}`;
                } else {
                    datesInput.dataset.datespickerValue = "";
                    datesInput.value = "";
                }
            };

            const setStagedFromApplied = () => {
                let start = parseISODate(applied[0] ?? "");
                let end = parseISODate(applied[1] ?? "");
                if (!hasReadInitialDataset && (!start || !end) && datesInput) {
                    const raw = (datesInput.dataset.datespickerValue || "").split("–").map(part => part.trim());
                    if (!start && raw[0]) start = parseISODate(raw[0]);
                    if (!end && raw[1]) end = parseISODate(raw[1]);
                }
                start = start ? clampToDate(start) : null;
                end = end ? clampToDate(end) : null;
                if (start && end && end.getTime() < start.getTime()) {
                    [start, end] = [end, start];
                }
                if (start && end) {
                    stagedDates = [start, end];
                } else if (start) {
                    stagedDates = [start, null];
                } else if (end) {
                    stagedDates = [end, null];
                } else {
                    stagedDates = [null, null];
                }
                hoverDate = null;
                const nextView = stagedDates[0] ? startOfMonth(stagedDates[0]) : minViewDate;
                viewDate = nextView.getTime() < minViewDate.getTime() ? minViewDate : nextView;
                hasReadInitialDataset = true;
                updateDisplayFromStaged();
            };

            const handleDaySelection = (isoValue) => {
                const nextDate = parseISODate(isoValue);
                if (!nextDate) return;
                const normalized = clampToDate(nextDate);
                if (isDateInPast(normalized)) return;
                const startSel = stagedDates[0];
                const endSel = stagedDates[1];
                if (!startSel || (startSel && endSel)) {
                    stagedDates = [normalized, null];
                } else {
                    if (normalized.getTime() < startSel.getTime()) {
                        stagedDates = [normalized, startSel];
                    } else if (isSameDay(normalized, startSel)) {
                        stagedDates = [normalized, normalized];
                    } else {
                        stagedDates = [startSel, normalized];
                    }
                }
                hoverDate = null;
                updateDisplayFromStaged();
                renderCalendar();
                if (isModalActive() && stagedDates[0] && stagedDates[1]) {
                    commitDates();
                }
            };

            const renderMonth = (baseDate, addClass = '') => {
                const monthEl = document.createElement("div");
                monthEl.className = "datespicker-month " + addClass;

                const title = document.createElement("div");
                title.className = "datespicker-month-name";
                title.textContent = formatMonthTitle(baseDate);
                monthEl.appendChild(title);

                const weekdaysRow = document.createElement("div");
                weekdaysRow.className = "datespicker-weekdays";
                WEEKDAYS_SHORT.forEach((name) => {
                    const cell = document.createElement("div");
                    cell.className = "datespicker-weekday";
                    cell.textContent = name;
                    weekdaysRow.appendChild(cell);
                });
                monthEl.appendChild(weekdaysRow);

                const grid = document.createElement("div");
                grid.className = "datespicker-grid";

                const firstDay = startOfMonth(baseDate);
                const offset = (firstDay.getDay() + 6) % 7;
                let cursor = addDays(firstDay, -offset);

                const startSel = stagedDates[0];
                const endSel = stagedDates[1];
                const previewEnd = (!endSel && startSel && hoverDate) ? clampToDate(hoverDate) : endSel;
                const rangeStart = startSel ? clampToDate(startSel) : null;
                const rangeEnd = rangeStart ? clampToDate(previewEnd || rangeStart) : null;

                const addDayHandlers = (btnDay, isoValue) => {
                    const selectDate = () => {
                        handleDaySelection(isoValue);
                    };

                    const handleTouchLike = () => {
                        if (btnDay.disabled) {
                            return;
                        }
                        armSkipForIso(isoValue);
                        selectDate();
                    };

                    btnDay.addEventListener("click", () => {
                        if (shouldSkipClickForIso(isoValue)) {
                            clearSkipForIso(isoValue);
                            return;
                        }
                        clearSkipForIso(isoValue);
                        selectDate();
                    });

                    const canUsePointer = typeof window !== "undefined" && window.PointerEvent;

                    if (canUsePointer) {
                        let pendingTouchPointerId = null;
                        let pendingTouchStart = null;
                        let pointerMoveExceeded = false;
                        let removePendingMoveListener = null;
                        const TAP_DRAG_CANCEL_PX = 32;
                        const SHEET_DRAG_CANCEL_PX = 24;
                        const detachGlobalMove = () => {
                            if (removePendingMoveListener) {
                                removePendingMoveListener();
                                removePendingMoveListener = null;
                            }
                        };

                        btnDay.addEventListener("pointerdown", (e) => {
                            if (e.pointerType === "mouse") {
                                return;
                            }
                            detachGlobalMove();
                            pendingTouchPointerId = e.pointerId;
                            pendingTouchStart = { x: e.clientX, y: e.clientY };
                            pointerMoveExceeded = false;
                            const onGlobalMove = (moveEvent) => {
                                if (moveEvent.pointerId !== pendingTouchPointerId) {
                                    return;
                                }
                                if (moveEvent.pointerType === "mouse" || !pendingTouchStart) {
                                    return;
                                }
                                const dx = Math.abs(moveEvent.clientX - pendingTouchStart.x);
                                const dy = Math.abs(moveEvent.clientY - pendingTouchStart.y);
                                if (dx > TAP_DRAG_CANCEL_PX || dy > TAP_DRAG_CANCEL_PX) {
                                    pointerMoveExceeded = true;
                                }
                            };
                            window.addEventListener("pointermove", onGlobalMove, { passive: true });
                            removePendingMoveListener = () => {
                                window.removeEventListener("pointermove", onGlobalMove);
                            };
                        });

                        btnDay.addEventListener("pointerup", (e) => {
                            if (e.pointerType === "mouse") {
                                return;
                            }
                            if (pendingTouchPointerId !== e.pointerId) {
                                return;
                            }
                            detachGlobalMove();
                            const startPoint = pendingTouchStart;
                            pendingTouchStart = null;
                            const totalDx = startPoint ? Math.abs(e.clientX - startPoint.x) : 0;
                            const totalDy = startPoint ? Math.abs(e.clientY - startPoint.y) : 0;
                            if (totalDx > TAP_DRAG_CANCEL_PX || totalDy > TAP_DRAG_CANCEL_PX) {
                                pointerMoveExceeded = true;
                            }
                            pendingTouchPointerId = null;
                            const popRoot = btnDay.closest(".exs-popover");
                            let shouldSkipForSheetDrag = false;
                            if (popRoot && popRoot.dataset.sheetDragging === "true") {
                                const distance = Number(popRoot.dataset.sheetDragDistance || "0");
                                if (Number.isFinite(distance) && distance > SHEET_DRAG_CANCEL_PX) {
                                    shouldSkipForSheetDrag = true;
                                }
                            }
                            const fingerMovedFar = pointerMoveExceeded;
                            pointerMoveExceeded = false;
                            if (shouldSkipForSheetDrag || fingerMovedFar) {
                                armSkipForIso(isoValue);
                                setTimeout(() => { clearSkipForIso(isoValue); }, 300);
                                return;
                            }
                            handleTouchLike();
                        });

                        btnDay.addEventListener("pointercancel", (e) => {
                            if (e.pointerType === "mouse") {
                                return;
                            }
                            if (pendingTouchPointerId === e.pointerId) {
                                pendingTouchPointerId = null;
                                pendingTouchStart = null;
                                pointerMoveExceeded = false;
                                detachGlobalMove();
                            }
                        });
                    } else {
                        let touchStarted = false;

                        btnDay.addEventListener("touchstart", () => {
                            touchStarted = true;
                        }, { passive: true });

                        btnDay.addEventListener("touchend", () => {
                            if (!touchStarted) {
                                return;
                            }
                            touchStarted = false;
                            handleTouchLike();
                        });

                        btnDay.addEventListener("touchcancel", () => {
                            touchStarted = false;
                        }, { passive: true });
                    }
                };

                for (let i = 0; i < 42; i++) {
                    const cellDate = cursor;
                    const isoValue = toISODate(cellDate);
                    const btnDay = document.createElement("button");
                    btnDay.type = "button";
                    btnDay.className = "datespicker-day";
                    btnDay.textContent = String(cellDate.getDate());
                    if (cellDate.getMonth() !== baseDate.getMonth()) {
                        btnDay.classList.add("is-outside");
                    }
                    if (isSameDay(cellDate, today)) {
                        btnDay.classList.add("is-today");
                    }
                    const isPast = isDateInPast(cellDate);
                    if (isPast) {
                        btnDay.classList.add("is-disabled");
                        btnDay.disabled = true;
                    }
                    if (rangeStart) {
                        if (isDayBetween(cellDate, rangeStart, rangeEnd)) {
                            btnDay.classList.add("is-range");
                            if (isDayBetween(addDays(cellDate, -1), rangeStart, rangeEnd)) {
                                btnDay.classList.add("is-to-left");
                            }
                            if (isDayBetween(addDays(cellDate, 1), rangeStart, rangeEnd)) {
                                btnDay.classList.add("is-to-right");
                            }
                        }
                        if (isSameDay(cellDate, rangeStart)) {
                            btnDay.classList.add("is-range-start");
                        }
                        if (rangeEnd && isSameDay(cellDate, rangeEnd)) {
                            btnDay.classList.add("is-range-end");
                        }
                    }
                    if (!isPast) {
                        addDayHandlers(btnDay, isoValue);
                        btnDay.addEventListener("mouseenter", () => {
                            if (!stagedDates[0] || stagedDates[1]) return;
                            const nextHover = clampToDate(cellDate);
                            if (isDateInPast(nextHover)) return;
                            if (hoverDate && isSameDay(nextHover, hoverDate)) return;
                            hoverDate = nextHover;
                            renderCalendar();
                        });
                    }
                    grid.appendChild(btnDay);
                    cursor = addDays(cursor, 1);
                }

                monthEl.appendChild(grid);
                return monthEl;
            };

            const renderCalendar = () => {
                if (!datesCalendarWrap) return;
                datesCalendarWrap.innerHTML = "";
                const datespickerRoot = document.createElement("div");
                datespickerRoot.className = "datespicker";

                const nav = document.createElement("div");
                nav.className = "datespicker-nav";

                const prevBtn = document.createElement("button");
                prevBtn.type = "button";
                prevBtn.className = "datespicker-nav-btn datespicker-nav-btn_prev";
                prevBtn.setAttribute("aria-label", "Предыдущий месяц");
                prevBtn.textContent = "";
                const prevTarget = addMonths(viewDate, -1);
                const canGoPrev = prevTarget.getTime() >= minViewDate.getTime();
                if (!canGoPrev) {
                    prevBtn.disabled = true;
                } else {
                    prevBtn.addEventListener("click", () => {
                        const host = pop.querySelector(".datespicker-calendars");
                        const fromH = host ? host.offsetHeight : 0;

                        const nextView = addMonths(viewDate, -1);
                        viewDate = nextView.getTime() < minViewDate.getTime() ? minViewDate : nextView;

                        renderCalendar();

                        const newHost = pop.querySelector(".datespicker-calendars");
                        if (newHost) {
                            const toH = newHost.offsetHeight;

                            newHost.style.height = fromH + "px";
                            newHost.style.overflow = "hidden";
                            void newHost.getBoundingClientRect();

                            newHost.style.transition = "height 180ms ease";
                            requestAnimationFrame(() => {
                                newHost.style.height = toH + "px";
                            });

                            newHost.addEventListener("transitionend", () => {
                                newHost.style.height = "";
                                newHost.style.transition = "";
                                newHost.style.overflow = "";
                            }, { once: true });
                        }
                    });
                }

                const nextBtn = document.createElement("button");
                nextBtn.type = "button";
                nextBtn.className = "datespicker-nav-btn datespicker-nav-btn_next";
                nextBtn.setAttribute("aria-label", "Следующий месяц");
                nextBtn.textContent = "";
                nextBtn.addEventListener("click", () => {
                    const host = pop.querySelector(".datespicker-calendars");
                    const fromH = host ? host.offsetHeight : 0;

                    viewDate = addMonths(viewDate, 1);

                    renderCalendar();

                    const newHost = pop.querySelector(".datespicker-calendars");
                    if (newHost) {
                        const toH = newHost.offsetHeight;

                        newHost.style.height = fromH + "px";
                        newHost.style.overflow = "hidden";
                        void newHost.getBoundingClientRect();

                        newHost.style.transition = "height 180ms ease";
                        requestAnimationFrame(() => {
                            newHost.style.height = toH + "px";
                        });

                        newHost.addEventListener("transitionend", () => {
                            newHost.style.height = "";
                            newHost.style.transition = "";
                            newHost.style.overflow = "";
                        }, { once: true });
                    }
                });

                const title = document.createElement("div");
                title.className = "datespicker-nav-title";
                const nextMonth = addMonths(viewDate, 1);
                title.textContent = `${formatMonthTitle(viewDate)} – ${formatMonthTitle(nextMonth)}`;

                nav.appendChild(prevBtn);
                nav.appendChild(title);
                nav.appendChild(nextBtn);
                datespickerRoot.appendChild(nav);

                const calendarsWrap = document.createElement("div");
                calendarsWrap.className = "datespicker-calendars";
                calendarsWrap.appendChild(renderMonth(viewDate, 'datespicker-month_left'));
                calendarsWrap.appendChild(renderMonth(nextMonth, 'datespicker-month_right'));
                datespickerRoot.appendChild(calendarsWrap);

                calendarsWrap.addEventListener("mouseleave", () => {
                    if (!stagedDates[0] || stagedDates[1] || !hoverDate) return;
                    hoverDate = null;
                    renderCalendar();
                });

                datesCalendarWrap.appendChild(datespickerRoot);
            };

            const commitDates = () => {
                const startSel = stagedDates[0];
                const endCandidate = stagedDates[1] ?? stagedDates[0];
                if (startSel && endCandidate) {
                    let a = clampToDate(startSel);
                    let b = clampToDate(endCandidate);
                    if (b.getTime() < a.getTime()) [a, b] = [b, a];
                    applied = [toISODate(a), toISODate(b)];
                } else {
                    applied = ["", ""];
                }
                writeHidden();
                updateBtn();
                setStagedFromApplied();
                renderCalendar();
            };

            const resetDates = () => {
                applied = ["", ""];
                stagedDates = [null, null];
                hoverDate = null;
                viewDate = minViewDate;
                if (datesInput) {
                    datesInput.dataset.datespickerValue = "";
                    datesInput.value = "";
                }
                writeHidden();
                updateBtn();
                updateDisplayFromStaged();
                renderCalendar();
            };

            const open = () => {
                if (currentOpen && currentOpen.root !== root) currentOpen.close();
                setStagedFromApplied();
                renderCalendar();
                if (pop) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
                const { restore } = portalOpen(pop, btn);
                portalRestore = restore;
                ensureOverlay(); moveOverlayOnTop(); lockScrollBody(true);
                if (isMobile()) {
                    startKeyframe(pop, "open");
                    detachSwipe = attachSwipe(pop, api);
                }
                currentOpen = { root, pop, trigger: btn, close: api.close };
            };

            const reallyHide = () => { if (pop) pop.hidden = true; };

            const close = (opts = {}) => {
                const { animatedFromY = null, alreadyAnimated = false } = opts;

                const finalize = () => {
                    removeOverlay(); lockScrollBody(false);
                    reallyHide();
                    if (portalRestore) { portalRestore(); portalRestore = null; }
                    btn.setAttribute("aria-expanded", "false");
                    if (currentOpen && currentOpen.root === root) currentOpen = null;
                };

                if (detachSwipe) { detachSwipe(); detachSwipe = null; }

                if (isMobile()) {
                    if (alreadyAnimated) {
                        finalize();
                    } else if (Number.isFinite(animatedFromY) && animatedFromY > 0) {
                        animateFromTo(pop, animatedFromY, "translateY(100%)", 180, "ease", finalize);
                    } else {
                        startKeyframe(pop, "close");
                        setTimeout(finalize, 180);
                    }
                    setTimeout(() => { pop.style.transform = ""; pop.style.animation = ""; }, 200);
                } else {
                    desktopFadeOut(pop, finalize);
                }
            };

            const trapFocus = (e) => {
                if (e.key !== "Tab") return;
                const focusables = pop.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])");
                if (!focusables.length) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };

            ["pointerdown", "mousedown", "touchstart", "click"].forEach(ev => {
                pop.addEventListener(ev, (ev2) => ev2.stopPropagation(), { passive: ev === "touchstart" });
            });

            btn.addEventListener("click", (e) => { e.stopPropagation(); (pop.hidden ? open : api.close)(); });
            btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (pop.hidden ? open : api.close)(); } });
            pop.addEventListener("keydown", trapFocus);
            pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } });
            closeX?.addEventListener("click", () => api.close());

            pop.addEventListener("click", (e) => {
                const action = e.target?.dataset?.action;
                if (action === "reset") {
                    resetDates();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
                if (action === "apply") {
                    commitDates();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
            });

            readHidden();
            if ((!applied[0] || !applied[1]) && datesInput?.dataset?.datespickerValue) {
                const parts = datesInput.dataset.datespickerValue.split("–").map(part => part.trim());
                if (parts.length === 2) {
                    const start = parseISODate(parts[0]);
                    const end = parseISODate(parts[1]);
                    if (start && end) {
                        applied = [toISODate(start), toISODate(end)];
                        writeHidden();
                    }
                }
            }
            setStagedFromApplied();
            if (datesCalendarWrap) {
                renderCalendar();
            }
            updateBtn();

            var api = { root, pop, trigger: btn, close };
            extraSelectRegistry.set(root, {
                field,
                type,
                commitFromUi: commitDates,
                resetForAll: resetDates,
                isActive: () => hasActive
            });

        } else if (type === "range") {
            const min = +root.dataset.min || 0;
            const max = +root.dataset.max || 0;
            const step = +root.dataset.step || 1;

            const fromNum = pop.querySelector(".js-exs-from");
            const toNum = pop.querySelector(".js-exs-to");
            const pluginEl = pop.querySelector(".js-exs-range");

            const clamp = (v) => Math.min(max, Math.max(min, v));

            noUiSlider.create(pluginEl, {
                start: [min, max],
                connect: true,
                step: step,
                range: { min: min, max: max },
                // behaviour: "drag",
                keyboardSupport: true,
            });

            let staged = [min, max];

            const setStagedFromApplied = () => {
                let a = applied[0] === "" ? min : clamp(+applied[0]);
                let b = applied[1] === "" ? max : clamp(+applied[1]);
                if (a > b) [a, b] = [b, a];
                staged = [a, b];
                pluginEl.noUiSlider.set(staged);
                fromNum.value = a;
                toNum.value = b;
            };

            const commitRange = () => {
                const a = clamp(+fromNum.value);
                const b = clamp(+toNum.value);
                const lo = Math.min(a, b);
                const hi = Math.max(a, b);
                applied = [String(lo), String(hi)];
                pluginEl.noUiSlider.set([lo, hi]);
                staged = [lo, hi];
                fromNum.value = lo;
                toNum.value = hi;
                writeHidden();
                updateBtn();
            };

            const resetRange = () => {
                applied = [String(min), String(max)];
                pluginEl.noUiSlider.set([min, max]);
                staged = [min, max];
                fromNum.value = min;
                toNum.value = max;
                writeHidden();
                updateBtn();
            };

            pluginEl.noUiSlider.on("update", (values) => {
                const a = Math.round(values[0]); const b = Math.round(values[1]);
                staged = [a, b];
                if (document.activeElement !== fromNum) fromNum.value = a;
                if (document.activeElement !== toNum) toNum.value = b;
            });

            let suppressModalRangeCommit = false;

            const commitRangeFromModal = () => {
                if (!isModalActive() || suppressModalRangeCommit) {
                    return;
                }
                suppressModalRangeCommit = true;
                commitRange();
                suppressModalRangeCommit = false;
            };

            const syncFrom = () => {
                let v = clamp(+fromNum.value);
                let other = staged[1];
                if (v > other) other = v;
                pluginEl.noUiSlider.set([v, other]); staged = [v, other];
            };
            const syncTo = () => {
                let v = clamp(+toNum.value);
                let other = staged[0];
                if (v < other) other = v;
                pluginEl.noUiSlider.set([other, v]); staged = [other, v];
            };
            fromNum.addEventListener("input", syncFrom);
            toNum.addEventListener("input", syncTo);
            fromNum.addEventListener("change", commitRangeFromModal);
            toNum.addEventListener("change", commitRangeFromModal);
            pluginEl.noUiSlider.on("change", commitRangeFromModal);

            const open = () => {
                if (currentOpen && currentOpen.root !== root) currentOpen.close();
                setStagedFromApplied();
                pop.hidden = false; btn.setAttribute("aria-expanded", "true");

                const { restore } = portalOpen(pop, btn);
                portalRestore = restore;
                ensureOverlay(); moveOverlayOnTop(); lockScrollBody(true);
                if (isMobile()) {
                    startKeyframe(pop, "open");
                    detachSwipe = attachSwipe(pop, api);
                }
                currentOpen = { root, pop, trigger: btn, close: api.close };
            };

            const reallyHide = () => { pop.hidden = true; };

            const close = (opts = {}) => {
                const { animatedFromY = null, alreadyAnimated = false } = opts;

                const finalize = () => {
                    removeOverlay(); lockScrollBody(false);
                    reallyHide();
                    if (portalRestore) { portalRestore(); portalRestore = null; }
                    btn.setAttribute("aria-expanded", "false");
                    if (currentOpen && currentOpen.root === root) currentOpen = null;
                };

                if (detachSwipe) { detachSwipe(); detachSwipe = null; }

                if (isMobile()) {
                    if (alreadyAnimated) {
                        finalize();
                    } else if (Number.isFinite(animatedFromY) && animatedFromY > 0) {
                        animateFromTo(pop, animatedFromY, "translateY(100%)", 180, "ease", finalize);
                    } else {
                        startKeyframe(pop, "close");
                        setTimeout(finalize, 180);
                    }
                    setTimeout(() => { pop.style.transform = ""; pop.style.animation = ""; }, 200);
                } else {
                    desktopFadeOut(pop, finalize);
                }
            };

            const trapFocus = (e) => {
                if (e.key !== "Tab") return;
                const f = pop.querySelectorAll("input,button,.noUi-handle,[tabindex]:not([tabindex='-1'])");
                if (!f.length) return;
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            };

            ["pointerdown", "mousedown", "touchstart", "click"].forEach(ev => {
                pop.addEventListener(ev, (ev2) => ev2.stopPropagation(), { passive: ev === "touchstart" });
            });

            btn.addEventListener("click", (e) => { e.stopPropagation(); (pop.hidden ? open : api.close)(); });
            btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (pop.hidden ? open : api.close)(); } });
            pop.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); api.close(); } });
            pop.addEventListener("keydown", trapFocus);
            const closeXRange = pop.querySelector(".js-exs-close");
            closeXRange?.addEventListener("click", () => api.close());

            pop.addEventListener("click", (e) => {
                const action = e.target?.dataset?.action;
                if (action === "reset") {
                    resetRange();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
                if (action === "apply") {
                    commitRange();
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied } }));
                    api.close();
                    submitAjax();
                }
            });

            readHidden();
            if (!applied.length) {
                applied = [String(min), String(max)];
                writeHidden();
            }
            setStagedFromApplied();
            updateBtn();

            var api = { root, pop, trigger: btn, close };
            extraSelectRegistry.set(root, {
                field,
                type,
                commitFromUi: commitRange,
                resetForAll: resetRange,
                isActive: () => hasActive
            });

        } else if (type === "radio") {
            const radios = pop ? [...pop.querySelectorAll('input[type="radio"]')] : [];

            const defaultRadio = radios.find(r => r.dataset.isDefault === "true");
            defaultRadioValue = defaultRadio ? defaultRadio.value : (radios[0]?.value || "");

            const syncRadiosFromApplied = () => {
                const val = applied[0] || "";
                radios.forEach(r => { r.checked = (r.value === val); });
            };

            const setRadioValue = (val) => {
                const next = val || "";
                applied = [next];
                syncRadiosFromApplied();
                writeHidden();
                updateBtn();
            };

            const commitFromRadios = () => {
                const selected = radios.find(r => r.checked) || radios.find(r => r.value === defaultRadioValue) || radios[0];
                setRadioValue(selected ? selected.value : defaultRadioValue);
            };

            const resetRadios = () => {
                setRadioValue(defaultRadioValue);
            };

            const open = () => {
                if (currentOpen && currentOpen.root !== root) currentOpen.close();
                syncRadiosFromApplied();
                pop.hidden = false; btn.setAttribute("aria-expanded", "true");

                const { restore } = portalOpen(pop, btn);
                portalRestore = restore;
                ensureOverlay(); moveOverlayOnTop(); lockScrollBody(true);
                if (isMobile()) {
                    startKeyframe(pop, "open");
                    detachSwipe = attachSwipe(pop, api);
                }

                currentOpen = { root, pop, trigger: btn, close: api.close };
                (radios.find(x => x.checked) || radios[0])?.focus();
            };

            const reallyHide = () => { pop.hidden = true; };

            const close = (opts = {}) => {
                const { animatedFromY = null, alreadyAnimated = false } = opts;

                const finalize = () => {
                    removeOverlay(); lockScrollBody(false);
                    reallyHide();
                    if (portalRestore) { portalRestore(); portalRestore = null; }
                    btn.setAttribute("aria-expanded", "false");
                    if (currentOpen && currentOpen.root === root) currentOpen = null;
                };

                if (detachSwipe) { detachSwipe(); detachSwipe = null; }

                if (isMobile()) {
                    if (alreadyAnimated) {
                        finalize();
                    } else if (Number.isFinite(animatedFromY) && animatedFromY > 0) {
                        animateFromTo(pop, animatedFromY, "translateY(100%)", 180, "ease", finalize);
                    } else {
                        startKeyframe(pop, "close");
                        setTimeout(finalize, 180);
                    }
                    setTimeout(() => { pop.style.transform = ""; pop.style.animation = ""; }, 200);
                } else {
                    desktopFadeOut(pop, finalize);
                }
            };

            ["pointerdown", "mousedown", "touchstart", "click"].forEach(ev => {
                pop.addEventListener(ev, (ev2) => ev2.stopPropagation(), { passive: ev === "touchstart" });
            });

            btn.addEventListener("click", (e) => { e.stopPropagation(); (pop.hidden ? open : api.close)(); });
            btn.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (pop.hidden ? open : api.close)(); } });
            const closeXRadio = pop.querySelector(".js-exs-close");
            closeXRadio?.addEventListener("click", () => api.close());

            pop.addEventListener("change", (e) => {
                const r = e.target;
                if (r && r.type === "radio") {
                    setRadioValue(r.value);
                    root.dispatchEvent(new CustomEvent("exs-apply", { detail: { field: field, values: applied, instant: true } }));
                    api.close();
                    submitAjax();
                }
            });

            readHidden();
            setRadioValue(applied[0] || defaultRadioValue);

            var api = { root, pop, trigger: btn, close };
            extraSelectRegistry.set(root, {
                field,
                type,
                commitFromUi: commitFromRadios,
                resetForAll: resetRadios,
                defaultValue: defaultRadioValue,
                isActive: () => hasActive
            });

        } else if (type === "stub") {
            const open = () => {
                if (currentOpen && currentOpen.root !== root) currentOpen.close();
                if (pop) { pop.hidden = false; btn.setAttribute("aria-expanded", "true"); }
                const { restore } = portalOpen(pop, btn);
                portalRestore = restore;
                ensureOverlay(); moveOverlayOnTop(); lockScrollBody(true);
                if (isMobile()) {
                    startKeyframe(pop, "open");
                    detachSwipe = attachSwipe(pop, api);
                }
                currentOpen = { root, pop, trigger: btn, close: api.close };
            };
            const reallyHide = () => { if (pop) pop.hidden = true; };
            const close = (opts = {}) => {
                const { animatedFromY = null, alreadyAnimated = false } = opts;
                const finalize = () => {
                    removeOverlay(); lockScrollBody(false);
                    reallyHide();
                    if (portalRestore) { portalRestore(); portalRestore = null; }
                    btn.setAttribute("aria-expanded", "false");
                    if (currentOpen && currentOpen.root === root) currentOpen = null;
                };
                if (detachSwipe) { detachSwipe(); detachSwipe = null; }
                if (isMobile()) {
                    if (alreadyAnimated) { finalize(); }
                    else if (Number.isFinite(animatedFromY) && animatedFromY > 0) {
                        animateFromTo(pop, animatedFromY, "translateY(100%)", 180, "ease", finalize);
                    } else {
                        startKeyframe(pop, "close");
                        setTimeout(finalize, 180);
                    }
                    setTimeout(() => { pop.style.transform = ""; pop.style.animation = ""; }, 200);
                } else {
                    desktopFadeOut(pop, finalize);
                }
            };

            ["pointerdown", "mousedown", "touchstart", "click"].forEach(ev => {
                pop.addEventListener(ev, (ev2) => ev2.stopPropagation(), { passive: ev === "touchstart" });
            });

            btn.addEventListener("click", (e) => { e.stopPropagation(); (pop.hidden ? open : api.close)(); });
            const closeXStub = pop.querySelector(".js-exs-close");
            closeXStub?.addEventListener("click", () => api.close());
            pop.addEventListener("click", (e) => {
                const action = e.target?.dataset?.action;
                if (action === "reset") { api.close(); submitAjax(); }
                if (action === "apply") { api.close(); submitAjax(); }
            });

            updateBtn();
            var api = { root, pop, trigger: btn, close };
            extraSelectRegistry.set(root, {
                field,
                type,
                commitFromUi: null,
                resetForAll: null,
                isActive: () => hasActive
            });
        }
    });

    updateFiltersBadge();

    const openBtn  = document.querySelector(".js-filters-open");
    const closeBtn = filters.querySelector(".js-filters-close");
    const resetAll = filters.querySelector(".js-filters-reset-all");
    const applyAll = filters.querySelector(".js-filters-apply-all");
    const scope    = filters.querySelector("[data-filters-scope]");

    let modalBackdrop = null;
    const createBackdrop = () => {
        if (modalBackdrop) return;
        modalBackdrop = document.createElement("div");
        modalBackdrop.className = "modal-backdrop";
        let downOnBackdrop = false;

        modalBackdrop.addEventListener("mousedown", () => { downOnBackdrop = true; }, { passive: true });
        modalBackdrop.addEventListener("mouseup", () => {
            if (downOnBackdrop) {
                if (currentOpen) { currentOpen.close(); }
                else { closeModal(); }
            }
            downOnBackdrop = false;
        }, { passive: true });

        document.body.appendChild(modalBackdrop);
    };
    const removeBackdrop = () => {
        if (!modalBackdrop) return;
        modalBackdrop.remove();
        modalBackdrop = null;
    };

    const lockPage = (on) => { document.body.style.overflow = on ? "hidden" : ""; };

    const modalFocusTrap = (e) => {
        if (!document.body.classList.contains("filters-modal")) return;
        if (e.key !== "Tab") return;
        const focusables = filters.querySelectorAll("button, input, [tabindex]:not([tabindex='-1'])");
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    const closeAllPopovers = () => {
        document.querySelectorAll(".exs-popover:not([hidden])").forEach(p => {
            const root = p.closest(".extra-select");
            root?.querySelector(".js-exs-trigger")?.click();
        });
    };

    const openModal = () => {
        closeAllPopovers();
        createGhost();
        document.body.classList.add("filters-modal");
        createBackdrop();
        lockPage(true);
        document.addEventListener("keydown", modalFocusTrap);
        closeBtn?.focus();
    };

    const closeModal = () => {
        closeAllPopovers();
        document.body.classList.remove("filters-modal");
        removeBackdrop();
        removeGhost();
        lockPage(false);
        document.removeEventListener("keydown", modalFocusTrap);
        openBtn?.focus();
    };

    const applyModal = () => {
        extraSelectRegistry.forEach((api) => {
            if (typeof api.commitFromUi === "function") {
                api.commitFromUi();
            }
        });

        submitAjax();
        closeModal();
    };

    openBtn?.addEventListener("click", openModal);
    closeBtn?.addEventListener("click", closeModal);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && document.body.classList.contains("filters-modal")) closeModal();
        // if (e.key === "Enter" && document.body.classList.contains("filters-modal")) applyModal();
    });

    resetAll?.addEventListener("click", () => {
        extraSelectRegistry.forEach((api) => {
            if (typeof api.resetForAll === "function") {
                api.resetForAll();
            }
        });
        standaloneFieldRegistry.forEach((api) => {
            if (typeof api.resetForAll === "function") {
                api.resetForAll();
            }
        });
        
        updateFiltersBadge();
        submitAjax();
    });

    applyAll?.addEventListener("click", () => {
        applyModal();
    });
})();
