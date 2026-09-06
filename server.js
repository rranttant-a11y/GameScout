```js
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

/* =========================================
   POPULAR SEARCH TRACKING
========================================= */

// Stores searches while the server is running.
//
// Example:
// {
//     "horror": 8,
//     "obby": 5,
//     "cars": 3
// }

const popularSearches = new Map();


/* =========================================
   ROBLOX SEARCH
========================================= */

async function searchRoblox(query) {

    const sessionId =
        "gamescout-" +
        Date.now() +
        "-" +
        Math.random()
            .toString(36)
            .substring(2, 10);

    const url =
        "https://apis.roblox.com/search-api/omni-search" +
        `?searchQuery=${encodeURIComponent(query)}` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        "&pageType=all";

    console.log("");
    console.log("🔎 Searching Roblox for:", query);

    const response = await fetch(url);

    if (!response.ok) {

        throw new Error(
            `Roblox search failed: ${response.status}`
        );

    }

    return await response.json();

}


/* =========================================
   EXTRACT GAMES FROM ROBLOX RESPONSE
========================================= */

function extractGames(data) {

    const games = [];

    const visited = new Set();

    function walk(value) {

        if (
            !value ||
            typeof value !== "object"
        ) {
            return;
        }

        if (visited.has(value)) {
            return;
        }

        visited.add(value);

        if (Array.isArray(value)) {

            for (const item of value) {
                walk(item);
            }

            return;
        }

        const universeId =
            value.universeId ??
            value.universeID ??
            value.universe_id;

        const placeId =
            value.placeId ??
            value.rootPlaceId ??
            value.rootPlaceID;

        const name =
            value.name ??
            value.displayName ??
            value.title;

        if (
            universeId &&
            name &&
            typeof name === "string"
        ) {

            const creator =
                value.creator?.name ??
                value.creatorName ??
                value.creator ??
                "Roblox Creator";

            const playing =
                value.playing ??
                value.playerCount ??
                value.players ??
                0;

            games.push({

                id: String(universeId),

                universeId:
                    String(universeId),

                placeId:
                    placeId
                        ? String(placeId)
                        : "",

                name:
                    String(name),

                creator:
                    typeof creator === "object"
                        ? String(
                            creator.name ||
                            "Roblox Creator"
                        )
                        : String(creator),

                playing:
                    Number(playing) || 0

            });

        }

        for (
            const key of Object.keys(value)
        ) {

            walk(value[key]);

        }

    }

    walk(data);


    /* =====================================
       REMOVE DUPLICATES
    ===================================== */

    const unique =
        new Map();

    for (
        const game of games
    ) {

        if (
            !unique.has(
                game.universeId
            )
        ) {

            unique.set(
                game.universeId,
                game
            );

        }

    }

    return Array.from(
        unique.values()
    );

}


/* =========================================
   GET ROBLOX THUMBNAILS
========================================= */

async function getGameThumbnails(
    universeIds
) {

    if (
        !universeIds.length
    ) {

        return new Map();

    }

    // Roblox allows batches, so only
    // send the first 50 at a time.

    const ids =
        universeIds
            .slice(0, 50)
            .join(",");

    const url =
        "https://thumbnails.roblox.com/v1/games/multiget/thumbnails" +
        `?universeIds=${encodeURIComponent(ids)}` +
        "&countPerUniverse=1" +
        "&defaults=true" +
        "&size=768x432" +
        "&format=Png" +
        "&isCircular=false";

    console.log(
        "🖼️ Getting thumbnails for",
        universeIds.length,
        "games"
    );

    try {

        const response =
            await fetch(url);

        if (!response.ok) {

            console.error(
                "Thumbnail request failed:",
                response.status
            );

            return new Map();

        }

        const data =
            await response.json();

        const thumbnailMap =
            new Map();

        if (
            !Array.isArray(
                data.data
            )
        ) {

            return thumbnailMap;

        }

        for (
            const item of data.data
        ) {

            if (!item) {
                continue;
            }

            const universeId =
                String(
                    item.universeId || ""
                );

            const thumbnails =
                Array.isArray(
                    item.thumbnails
                )
                    ? item.thumbnails
                    : [];

            const thumbnail =
                thumbnails.find(
                    (thumb) =>
                        thumb &&
                        thumb.imageUrl
                );

            if (
                universeId &&
                thumbnail?.imageUrl
            ) {

                thumbnailMap.set(
                    universeId,
                    thumbnail.imageUrl
                );

            }

        }

        return thumbnailMap;

    } catch (error) {

        console.error(
            "Thumbnail error:",
            error
        );

        return new Map();

    }

}


/* =========================================
   GET GAME DETAILS
========================================= */

// Roblox's Games API can give us a more
// reliable rootPlaceId.
//
// This helps make the PLAY button work
// even when the search response doesn't
// include placeId.

async function getGameDetails(
    universeIds
) {

    if (
        !universeIds.length
    ) {

        return new Map();

    }

    const detailsMap =
        new Map();

    // Roblox supports multiple universe IDs
    // in one request.

    const batches = [];

    for (
        let i = 0;
        i < universeIds.length;
        i += 50
    ) {

        batches.push(
            universeIds.slice(
                i,
                i + 50
            )
        );

    }

    for (
        const batch of batches
    ) {

        try {

            const url =
                "https://games.roblox.com/v1/games" +
                `?universeIds=${encodeURIComponent(
                    batch.join(",")
                )}`;

            const response =
                await fetch(url);

            if (!response.ok) {

                console.error(
                    "Game details request failed:",
                    response.status
                );

                continue;

            }

            const data =
                await response.json();

            if (
                !Array.isArray(
                    data.data
                )
            ) {

                continue;

            }

            for (
                const game of data.data
            ) {

                if (
                    game &&
                    game.id
                ) {

                    detailsMap.set(
                        String(game.id),
                        game
                    );

                }

            }

        } catch (error) {

            console.error(
                "Game details error:",
                error
            );

        }

    }

    return detailsMap;

}


/* =========================================
   COMBINE GAME DATA
========================================= */

async function buildGameResults(
    games
) {

    if (!games.length) {

        return [];

    }

    const universeIds =
        games.map(
            (game) =>
                game.universeId
        );

    const thumbnails =
        await getGameThumbnails(
            universeIds
        );

    const details =
        await getGameDetails(
            universeIds
        );

    const finalGames =
        games.map(
            (game) => {

                const detail =
                    details.get(
                        game.universeId
                    );

                return {

                    ...game,

                    // Use the search result's
                    // placeId first, then fall
                    // back to Roblox's official
                    // game details.

                    placeId:
                        game.placeId ||
                        (
                            detail?.rootPlaceId
                                ? String(
                                    detail.rootPlaceId
                                )
                                : ""
                        ),

                    name:
                        game.name ||
                        detail?.name ||
                        "Unknown Game",

                    creator:
                        game.creator ||
                        detail?.creator?.name ||
                        "Roblox Creator",

                    playing:
                        game.playing ||
                        detail?.playing ||
                        0,

                    thumbnail:
                        thumbnails.get(
                            game.universeId
                        ) || null

                };

            }
        );

    return finalGames;

}


/* =========================================
   RECORD SEARCH
========================================= */

function recordSearch(query) {

    const clean =
        String(query || "")
            .trim()
            .toLowerCase();

    if (!clean) {
        return;
    }

    // Don't let someone make the list
    // ridiculous with a massive query.

    if (
        clean.length > 100
    ) {
        return;
    }

    const current =
        popularSearches.get(
            clean
        ) || 0;

    popularSearches.set(
        clean,
        current + 1
    );

    console.log(
        "📈 Search recorded:",
        clean,
        "→",
        current + 1
    );

}


/* =========================================
   SEARCH API
========================================= */

app.get(
    "/api/search",
    async (req, res) => {

        try {

            const query =
                String(
                    req.query.q || ""
                ).trim();

            if (!query) {

                return res.json({
                    games: []
                });

            }

            if (
                query.length > 200
            ) {

                return res.status(400)
                    .json({

                        error:
                            "Search query is too long."

                    });

            }

            // Record the search.

            recordSearch(query);

            const searchData =
                await searchRoblox(
                    query
                );

            const games =
                extractGames(
                    searchData
                );

            console.log(
                "🎮 Games found:",
                games.length
            );

            const finalGames =
                await buildGameResults(
                    games
                );

            console.log(
                "🖼️ Thumbnails/details loaded."
            );

            res.json({
                games: finalGames
            });

        } catch (error) {

            console.error(
                "❌ Search error:",
                error
            );

            res.status(500)
                .json({

                    error:
                        "Failed to search Roblox.",

                    games: []

                });

        }

    }
);


/* =========================================
   TRENDING API
========================================= */

app.get(
    "/api/trending",
    async (req, res) => {

        try {

            const searchData =
                await searchRoblox(
                    "popular"
                );

            const games =
                extractGames(
                    searchData
                );

            console.log(
                "🔥 Trending games found:",
                games.length
            );

            const finalGames =
                await buildGameResults(
                    games
                );

            res.json({
                games: finalGames
            });

        } catch (error) {

            console.error(
                "❌ Trending error:",
                error
            );

            res.status(500)
                .json({

                    error:
                        "Failed to load trending games.",

                    games: []

                });

        }

    }
);


/* =========================================
   POPULAR SEARCHES API
========================================= */

app.get(
    "/api/popular-searches",
    (req, res) => {

        const searches =
            Array.from(
                popularSearches.entries()
            )
            .sort(
                (
                    a,
                    b
                ) =>
                    b[1] - a[1]
            )
            .slice(0, 8)
            .map(
                (
                    [
                        query,
                        count
                    ]
                ) => ({

                    query,
                    count

                })
            );

        res.json({
            searches
        });

    }
);


/* =========================================
   HOME PAGE
========================================= */

app.get(
    "/",
    (req, res) => {

        res.sendFile(
            path.join(
                __dirname,
                "index.html"
            )
        );

    }
);


/* =========================================
   404
========================================= */

app.use(
    (req, res) => {

        res.status(404)
            .json({
                error: "Not found."
            });

    }
);


/* =========================================
   START SERVER
========================================= */

app.listen(
    PORT,
    () => {

        console.log("");

        console.log(
            "===================================="
        );

        console.log(
            "       🎮 GameScout is running"
        );

        console.log(
            "===================================="
        );

        console.log(
            `http://localhost:${PORT}`
        );

        console.log("");

    }
);
```
