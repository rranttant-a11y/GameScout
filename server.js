const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));


// =========================================
// ROBLOX SEARCH
// =========================================

async function searchRoblox(query) {
    const sessionId =
        "gamescout-" +
        Date.now() +
        "-" +
        Math.random().toString(36).substring(2, 10);

    const url =
        "https://apis.roblox.com/search-api/omni-search" +
        `?searchQuery=${encodeURIComponent(query)}` +
        `&sessionId=${encodeURIComponent(sessionId)}` +
        "&pageType=all";

    console.log("Searching Roblox for:", query);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Roblox search failed: ${response.status}`
        );
    }

    return await response.json();
}


// =========================================
// FIND GAME OBJECTS
// =========================================

// Roblox's search API can put games inside several
// levels of nested objects. This searches the whole
// response instead of only checking one location.

function extractGames(data) {
    const games = [];
    const visited = new Set();

    function walk(value) {
        if (!value || typeof value !== "object") {
            return;
        }

        // Prevent circular objects from causing problems
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

        // Look for anything that resembles a Roblox game
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
                universeId: String(universeId),
                placeId: placeId
                    ? String(placeId)
                    : "",
                name: String(name),
                creator:
                    typeof creator === "object"
                        ? String(
                            creator.name ||
                            "Roblox Creator"
                        )
                        : String(creator),
                playing: Number(playing) || 0
            });
        }

        // Search every property recursively
        for (const key of Object.keys(value)) {
            walk(value[key]);
        }
    }

    walk(data);

    // Remove duplicates
    const unique = new Map();

    for (const game of games) {
        if (!unique.has(game.universeId)) {
            unique.set(
                game.universeId,
                game
            );
        }
    }

    return Array.from(unique.values());
}


// =========================================
// ROBLOX THUMBNAILS
// =========================================

async function getGameThumbnails(universeIds) {
    if (!universeIds.length) {
        return new Map();
    }

    // Roblox allows multiple universe IDs
    // in one thumbnail request.
    const ids = universeIds
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
        "Getting thumbnails for",
        universeIds.length,
        "games"
    );

    try {
        const response = await fetch(url);

        if (!response.ok) {
            console.error(
                "Thumbnail request failed:",
                response.status
            );

            return new Map();
        }

        const data = await response.json();

        const thumbnailMap = new Map();

        if (!Array.isArray(data.data)) {
            return thumbnailMap;
        }

        for (const item of data.data) {
            if (!item) {
                continue;
            }

            const universeId =
                String(item.universeId || "");

            const thumbnails =
                Array.isArray(item.thumbnails)
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


// =========================================
// SEARCH API
// =========================================

app.get("/api/search", async (req, res) => {
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

        if (query.length > 200) {
            return res.status(400).json({
                error:
                    "Search query is too long."
            });
        }

        // Search Roblox
        const searchData =
            await searchRoblox(query);

        // Extract ALL games
        const games =
            extractGames(searchData);

        console.log(
            "Games found:",
            games.length
        );

        // Get universe IDs
        const universeIds =
            games.map(
                (game) =>
                    game.universeId
            );

        // Get thumbnails
        const thumbnails =
            await getGameThumbnails(
                universeIds
            );

        // Attach thumbnails
        const finalGames =
            games.map((game) => ({
                ...game,

                thumbnail:
                    thumbnails.get(
                        game.universeId
                    ) || null
            }));

        console.log(
            "Thumbnails found:",
            thumbnails.size
        );

        res.json({
            games: finalGames
        });
    } catch (error) {
        console.error(
            "Search error:",
            error
        );

        res.status(500).json({
            error:
                "Failed to search Roblox.",

            games: []
        });
    }
});


// =========================================
// TRENDING
// =========================================

app.get("/api/trending", async (req, res) => {
    try {
        const searchData =
            await searchRoblox(
                "popular Roblox games"
            );

        const games =
            extractGames(searchData);

        const universeIds =
            games.map(
                (game) =>
                    game.universeId
            );

        const thumbnails =
            await getGameThumbnails(
                universeIds
            );

        const finalGames =
            games.map((game) => ({
                ...game,

                thumbnail:
                    thumbnails.get(
                        game.universeId
                    ) || null
            }));

        res.json({
            games: finalGames
        });
    } catch (error) {
        console.error(
            "Trending error:",
            error
        );

        res.status(500).json({
            error:
                "Failed to load trending games.",

            games: []
        });
    }
});


// =========================================
// HOME PAGE
// =========================================

app.get("/", (req, res) => {
    res.sendFile(
        path.join(
            __dirname,
            "index.html"
        )
    );
});


// =========================================
// 404
// =========================================

app.use((req, res) => {
    res.status(404).json({
        error: "Not found."
    });
});


// =========================================
// START SERVER
// =========================================

app.listen(PORT, () => {
    console.log("");
    console.log(
        "===================================="
    );
    console.log(
        "       GameScout is running"
    );
    console.log(
        "===================================="
    );
    console.log(
        `http://localhost:${PORT}`
    );
    console.log("");
});
