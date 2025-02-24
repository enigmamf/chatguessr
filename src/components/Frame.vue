<template>
    <div class="cg-scoreboard-container" ref="scoreboardContainer" :hidden="!isScoreboardVisible"></div>
    <div class="cg-menu">
        <button :class="['cg-button', twitchConnectionState]" title="settings" @click="openSettings">
            <span class="cg-icon cg-icon--gear"></span>
        </button>
        <button class="cg-button" title="Show/Hide scoreboard" @click="toggleScoreboard" :hidden="gameState === 'none'">
            <span :class="['cg-icon', scoreboardVisibleSetting ? 'cg-icon--eyeOpen' : 'cg-icon--eyeClosed']"></span>
        </button>
        <button class="cg-button" title="Center view" @click="centerSatelliteView" :hidden="satelliteModeEnabled.value !== 'enabled' || gameState !== 'in-round'">
            <span class="cg-icon cg-icon--flag"></span>
        </button>
    </div>
</template>
<style scoped>
[hidden] { display: none !important; }

.cg-scoreboard-container {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    overflow: hidden;
    pointer-events: none;
}

.cg-menu {
    z-index: 99998;
    display: flex;
    flex-direction: column;
    gap: 5px;
    top: 100px;
    position: fixed;
    right: 7px;
}

.cg-button {
    box-sizing: content-box;
    display: flex;
    user-select: none;
    background: rgba(0, 0, 0, 0.4);
    border: none;
    border-radius: 50px;
    padding: 0.5rem;
    width: 1.7rem;
    height: 1.7rem;
    transition: 0.3s;
    cursor: pointer;
}
.cg-button:hover {
    background: rgba(0, 0, 0, 0.5);
}

.cg-button.disconnected { background: red; }
.cg-button.connecting { background: blue; }
.cg-icon {
    background-size: contain;
    width: 100%;
    height: 100%;
}
.cg-icon--gear { background-image: url(asset:icons/gear.svg); }
.cg-icon--eyeOpen { background-image: url(asset:icons/opened_eye.svg); }
.cg-icon--eyeClosed { background-image: url(asset:icons/closed_eye.svg); }
.cg-icon--flag { background-image: url(asset:icons/startFlag.svg); }
</style>
<script lang="ts" setup>
import { ref, shallowRef, onMounted, onBeforeUnmount, watch, computed } from "vue";
import { useStyleTag } from "@vueuse/core";
import type { LatLng, Location, GameResult, Guess } from "../types";
// Only import the type here, we have to import Scoreboard on mount so jQuery has access to all the elements it needs.
import Scoreboard from "../Classes/Scoreboard";
import type { ChatguessrApi } from "../preload";

const {
    chatguessrApi,
    ...rendererApi
} = defineProps<{
    chatguessrApi: ChatguessrApi,
    drawRoundResults: (location: Location, roundResults: Guess[], limit?: number) => void,
    drawGameLocations: (locations: Location[]) => void,
    drawPlayerResults: (locations: Location[], result: GameResult) => void,
    clearMarkers: () => void,
    focusOnGuess: (location: LatLng) => void,
    showSatelliteMap: (location: LatLng) => void,
    hideSatelliteMap: () => void,
    centerSatelliteView: (location: LatLng) => void,
}>();

const gameState = ref<"in-round" | "round-results" | "game-results" | "none">("none");
const currentLocation = shallowRef<LatLng | null>(null);
const twitchConnectionState = useTwitchConnectionState();
const scoreboardVisibleSetting = ref(true);
const isScoreboardVisible = computed(() => gameState.value !== "none" && scoreboardVisibleSetting.value)
const satelliteModeEnabled = {
    // Manual implementation of `ref()` API
    // As `useLocalStorage` does not receive storage events from the non-vue UI script
    // TODO(@ReAnnannanna): Replace this with `useLocalStorage` when the pregame UI script is using Vue
    get value(): "enabled" | "disabled" {
        return localStorage.getItem("satelliteModeEnabled") === "enabled" ? "enabled" : "disabled";
    },
    set value(value: "enabled" | "disabled") {
        localStorage.setItem("satelliteModeEnabled", value);
    },
};

const scoreboardContainer = ref<HTMLDivElement | null>(null);
let scoreboard: Scoreboard | null = null;
onMounted(async () => {
    scoreboard = new Scoreboard(scoreboardContainer.value!, {
        focusOnGuess(location) {
            rendererApi.focusOnGuess(location);
        },
        drawPlayerResults(locations, result) {
            rendererApi.drawPlayerResults(locations, result);
        },
        onToggleGuesses(open) {
            chatguessrApi.setGuessesOpen(open);
        },
    });
});

// Remove the game's own markers while on a results screen (where we draw our own)
const markerRemover = useStyleTag('[data-qa="result-view-top"] [data-qa="guess-marker"], [data-qa="result-view-top"] [data-qa="correct-location-marker"], .result-map__line { display: none; }', {
    id: 'cg-marker-remover',
    manual: true,
});
const removeMarkers = computed(() => gameState.value === "round-results" || gameState.value === "game-results");
watch(removeMarkers, (load) => {
    console.log(gameState.value);
    if (load) {
        markerRemover.load();
    } else {
        markerRemover.unload();
    }
}, { immediate: true });

// Remove the game's controls when in satellite mode.
const gameControlsRemover = useStyleTag(".styles_columnTwo___2qFL, .styles_controlGroup___ArrW, .compass, .game-layout__compass { display: none !important; }", {
    id: "cg-game-controls-remover",
    manual: true,
});
// `satelliteModeEnabled` is not actually reactive, but the actual change we're interested in is in `gameState` anyways.
const removeGameControls = computed(() => gameState.value !== "none" && satelliteModeEnabled.value === "enabled");
watch(removeGameControls, (load) => {
    if (load) {
        gameControlsRemover.load();
    } else {
        gameControlsRemover.unload();
    }
}, { immediate: true });

onBeforeUnmount(chatguessrApi.onGameStarted((isMultiGuess, restoredGuesses, location) => {
    console.log("onGameStarted");
    gameState.value = "in-round";
    currentLocation.value = location;

    if (satelliteModeEnabled.value === "enabled") {
        rendererApi.showSatelliteMap(location);
    }

    if (!scoreboard) {
        return;
    }

    scoreboard.reset(isMultiGuess);

    if (restoredGuesses.length > 0) {
        if (isMultiGuess) {
            scoreboard.renderMultiGuess(restoredGuesses);
        } else {
            // Not very fast KEKW
            for (const guess of restoredGuesses) {
                scoreboard.renderGuess(guess);
            }
        }
    }
}));

onBeforeUnmount(chatguessrApi.onRefreshRound((location) => {
    console.log("onRefreshRound");
    gameState.value = "in-round";
    if (satelliteModeEnabled.value === "enabled") {
        rendererApi.showSatelliteMap(location);
    }
}));

onBeforeUnmount(chatguessrApi.onGameQuit(() => {
    gameState.value = "none";
    rendererApi.clearMarkers();
}));

onBeforeUnmount(chatguessrApi.onReceiveGuess((guess) => {
    scoreboard?.renderGuess(guess);
}));

onBeforeUnmount(chatguessrApi.onReceiveMultiGuesses((guesses) => {
    scoreboard?.renderMultiGuess(guesses);
}));

onBeforeUnmount(chatguessrApi.onShowRoundResults((round, location, roundResults, guessMarkersLimit) => {
    gameState.value = "round-results";

    rendererApi.drawRoundResults(location, roundResults, guessMarkersLimit);

    if (!scoreboard) {
        return;
    }

    scoreboard.displayRoundResults(roundResults, guessMarkersLimit);
    scoreboard.setTitle(`ROUND ${round} RESULTS (${roundResults.length})`);
    scoreboard.showSwitch(false);
}));

onBeforeUnmount(chatguessrApi.onShowGameResults((locations, gameResults) => {
    console.log("onShowGameResults");
    gameState.value = "game-results";
    rendererApi.drawGameLocations(locations);
    rendererApi.drawPlayerResults(locations, gameResults[0]);

    if (!scoreboard) {
        return;
    }

    scoreboard.displayGameResults(locations, gameResults);
    scoreboard.setTitle(`HIGHSCORES (${gameResults.length})`);
    scoreboard.showSwitch(false);
}));

onBeforeUnmount(chatguessrApi.onStartRound((isMultiGuess, location) => {
    console.log("onStartRound");
    gameState.value = "in-round";
    currentLocation.value = location;
    
    rendererApi.clearMarkers();
    if (satelliteModeEnabled.value === "enabled") {
        rendererApi.showSatelliteMap(location);
    }

    if (!scoreboard) {
        return;
    }

    scoreboard.reset(isMultiGuess);
    scoreboard.showSwitch(true);
}));

onBeforeUnmount(chatguessrApi.onGuessesOpenChanged((open) => {
    scoreboard?.switchOn(open);
}));

/** Load and update twitch connection state. */
function useTwitchConnectionState () {
    const conn = ref<"connected" | 'connecting' | 'disconnected'>("disconnected");

    onMounted(async () => {
        const { state } = await chatguessrApi.getConnectionState();
        conn.value = state;
    });

    onBeforeUnmount(chatguessrApi.onConnectionStateChange(({ state }) => {
        conn.value = state;
    }));

    return conn;
}

function openSettings () {
    chatguessrApi.openSettings();
}

function toggleScoreboard () {
    scoreboardVisibleSetting.value = !scoreboardVisibleSetting.value;
}

function centerSatelliteView () {
    if (currentLocation.value) {
        rendererApi.centerSatelliteView(currentLocation.value);
    }
}
</script>
