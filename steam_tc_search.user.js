// ==UserScript==
// @name         steam_tc_search
// @namespace    Cyb3rGamer
// @version      0.1
// @author       Cyb3r
// @description  A simple tool to enhance searching for Steam bundles containing TC games
// @updateURL    http://cyb3rgamer.github.io/steam_tc_search.user.js
// @downloadURL  http://cyb3rgamer.github.io/steam_tc_search.user.js
// @match        https://store.steampowered.com/search/?sort_by=Price_ASC&category1=996&category2=29&hidef2p=1
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @connect      steampowered.com
// ==/UserScript==

"use strict;"

const PRICE_PER_THRESHOLD = 0.4;

async function GM_fetch(request) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            method  : request.method,
            url     : request.url,
            headers : request.headers,
            data    : request.body,
            onload  : resolve,
            onerror : reject
        });
    });
}

async function GM_fetch_json(request) {
    const response = await GM_fetch(request);
    if (response.status !== 200) {
        throw new Error(`Request failed: ${response.status}`);
    }
    return JSON.parse(response.responseText);
}

async function get_appids() {
    const json = await GM_fetch_json({ url: `https://store.steampowered.com/dynamicstore/userdata/?_t=${Date.now()}` });
    return json.rgOwnedApps;
}

function wait_max(flagGetter, max) {
    return new Promise((resolve, reject) => {
        let start = Date.now();
        let intervalId = setInterval(() => {
            if (!flagGetter()) {
                clearInterval(intervalId);
                resolve();
            } else if (Date.now() - start > max) {
                clearInterval(intervalId);
                reject(new Error("Timeout"));
            }
        }, 100);
    });
}

const user_appids = await get_appids();

async function main() {

    const btn_load   = $("<button>Load</button>");
    const btn_filter = $("<button>Filter</button>");
    const btn_noChk  = $("<button>Remove Checked</button>")
        .on("click", () => {
            $(".tm-chk:checked").each(function() { $(this).parent().parent().remove(); });
      });

    btn_load.on("click", async function() {

        const size                                              = 100;
        unsafeWindow.InitInfiniteScroll.nScrollSize             = size;
        unsafeWindow.InitInfiniteScroll.oController.m_cPageSize = size;
        const totalRows                                         = unsafeWindow.InitInfiniteScroll.oController.m_cTotalCount;
        const totalPages                                        = Math.ceil( totalRows / size);
        unsafeWindow.InitInfiniteScroll.oController.m_cMaxPages = totalPages;

        btn_load.prop("disabled", true);
        for (let i = 0; i <= totalPages; i++) {
            try {
                await wait_max(() => unsafeWindow.InitInfiniteScroll.oController.m_bLoading, 10000);
            } catch (error) {
                console.log("Loading took too long, stopping...",i);
                break;
            }
            unsafeWindow.InitInfiniteScroll.oController.m_iCurrentPage = (i - 1);
            unsafeWindow.InitInfiniteScroll.oController.NextPage();
            btn_load.text(`Load (${ Math.round((i / totalPages) * 100)}%)`);
        }
        btn_load.text("Load");
        btn_load.prop("disabled", false);

    });

    btn_filter.on("click", function() {
        $("a.search_result_row.ds_collapse_flag").each(function() {

            if ($(this).hasClass("ds_owned")) {
                $(this).remove();
                return;
            }

            const score      = $(this).find("div.search_reviewscore");
            score.empty();

            const price_dom  = $(this).find("div.discount_final_price");
            const price_text = price_dom.text();
            const price      = parseFloat(
                    price_text
                    .trim()
                    .replace("Your Price:", "")
                    .replace("€", "")
                    .replace("$", "")
                    .replace("--", "0")
                    .replace(",", ".")
                    .replace(" ", ""));


            if (isNaN(price) || !isFinite(price)) {
                $(this).remove();
                return;
            }

            const jsonRaw    = $(this).attr("data-ds-bundle-data");
            const dsappids   = $(this).attr("data-ds-appid");
            if (!jsonRaw && !dsappids) {
                $(this).remove();
                return;
            }

            let appids = [];
            if (jsonRaw) {
                const json = JSON.parse(new DOMParser().parseFromString(jsonRaw, "text/html").documentElement.textContent);
                if (!json || !json.m_rgItems) {
                    $(this).remove();
                    return;
                }
                appids = json.m_rgItems.map(item => item.m_rgIncludedAppIDs).flat();
            } else {
                appids = dsappids.split(",");
            }

            const unique_appids   = [...new Set(appids)];
            const not_owned_total = unique_appids.filter(appid => !user_appids.includes(appid)).length;

            if (isNaN(not_owned_total) || !isFinite(not_owned_total) || not_owned_total <= 0) {
                $(this).remove();
                return;
            }

            const price_per       = price / not_owned_total;

            if (price_per > PRICE_PER_THRESHOLD) {
                $(this).remove();
                return;
            }

            score.empty();
            score.html(`<div>PP ${price_per.toFixed(2)}</div>`);

            const second_row = $("div.col.search_released.responsive_secondrow",$(this));


            let cid   = '';
            let ccat  = '';
            const bid = $(this).attr("data-ds-bundleid");
            const sid = $(this).attr("data-ds-packageid");
            if (bid) {
                cid  = bid;
                ccat = 'bundle';
            } else if (sid) {
                cid  = sid;
                ccat = 'sub';
            } else {
                console.error("No collection id!");
                return;
            }

            second_row.html(`<a href='https://steamdb.info/${ccat}/${cid}/'>SteamDB</a>`);

            const checkbox = $(`<input class="tm-chk" type="checkbox" ${GM_getValue(cid, false) ? "checked" : ""}>`);
            checkbox.on("change", function() {
                GM_setValue(cid, this.checked);
                if (this.checked) {
                    $(this).closest("a.search_result_row").css("background-color", "#d4edda");
                } else {
                    $(this).closest("a.search_result_row").css("background-color", "");
                }

            });
            const first_div =  $("div.col.search_capsule",$(this));
            first_div.empty().append(checkbox);

            if (GM_getValue(cid, false)) {
                $(this).css("background-color", "#d4edda");
            }
        });
    });

    $("h2.pageheader").parent().append(btn_load,btn_filter,btn_noChk);
}

main();
