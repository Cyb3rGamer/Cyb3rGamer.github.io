// ==UserScript==
// @name         Lestrade's
// @namespace    Cyb3r
// @author       Cyb3rGamer
// @version      0.1
// @description  A userscript to fetch gg.deals quotes
// @match        https://lestrades.com/*
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      gg.deals
// ==/UserScript==

'use strict';

async function GM_FetchHtml(request) {
    return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
            url     : request.url,
            onload  : (response) => {
                if (response.status !== 200) {
                    reject(new Error(`Request failed: ${response.status}`));
                } else {
                    const responseText = response.responseText;
                    resolve(new DOMParser().parseFromString(responseText, 'text/html'));
                }
            },
            onerror : reject
        });
    });
}

async function fetch_appid(game_id) {
    const body = await GM_FetchHtml({ url: `https://lestrades.com/game/${game_id}` });
    let href = $("a[href*='store.steampowered.com/app/']", body).eq(0).attr("href");

    if (!href) {
        href = $("a[href*='steamcommunity.com/app/']", body).eq(0).attr("href");
    }

    if (href) {
        return href.match(/app\/\d+/g)[0].split("/")[1];;
    } else {
        console.log("No appid found for game_id: ", game_id);
        return null;
    }
}

async function fetch_ggdeals_price(type, id) {
    try {
    console.log("fetching", `https://gg.deals/steam/${type}/${id}`);
    const body = await GM_FetchHtml({ url: `https://gg.deals/steam/${type}/${id}` });
    return $("#game-header-current-prices .price", body)
        .get()
        .map((t) => t.innerText)
        .join(" / ");
    } catch (e) {
        console.log(e, "with url", `https://gg.deals/steam/${type}/${id}`);
        return "Error";
    }
}

async function main() {

    $("[href*='store.steampowered.com/app/'],[href*='store.steampowered.com/sub/'],[href*='/game/']")
        .get()
        .forEach(async (elem) => {
            const pat      = elem.href.match(/(sub|app|game)\/\d+/g);
            if (!pat) return;
            let [type, id] = elem.href.match(/(sub|app|game)\/\d+/g)[0].split("/");

            $(elem).after(`
                    <span class="tag">
                        <a style="cursor: pointer;" class="ggdeals_fetcher" data-type="${type}" data-id="${id}">
                           [gg]
                        </a>
                        <small id="ggdeals_${type}_${id}_after"></small>
                    </span>`);

            $(`[id="ggdeals_${type}_${id}_after"]`).text(GM_getValue (`price_game_${type}_${id}`));
    });

    $('.ggdeals_fetcher').on("click",async function ()  {
        let price = "...";
        const id    = $(this).attr("data-id");
        let   type  = $(this).attr("data-type");
        $(`[id="ggdeals_${type}_${id}_after"]`).text(price);
        try {


            let gg_id   = id;
            let gg_type = type;
            if (type === "game") {
                gg_id   = GM_getValue(`appid_${id}`, await fetch_appid(id));
                gg_type = "app";
                GM_setValue(`appid_${id}`, gg_id);
            }

            price = await fetch_ggdeals_price(gg_type, gg_id);
            GM_setValue(`price_game_${type}_${id}`, price);
            GM_setValue(`price_${gg_type}_${gg_id}`, price);
        } catch (e) {
            console.log(e);
            price = "Error";
        }
        $(`[id="ggdeals_${type}_${id}_after"]`).text(price);

    });
}

main();
