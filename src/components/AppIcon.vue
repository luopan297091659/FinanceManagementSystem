<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.circle" />
  </svg>
</template>

<script setup>
defineProps({
  name: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
});

const paths = {
  circle: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18",
  "chevron-left": "m15 18-6-6 6-6",
  "chevron-right": "m9 18 6-6-6-6",
  check: "m20 6-11 11-5-5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  settings: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M12 2v3 M12 19v3 M4.93 4.93l2.12 2.12 M16.95 16.95l2.12 2.12 M2 12h3 M19 12h3 M4.93 19.07l2.12-2.12 M16.95 7.05l2.12-2.12",
  dashboard: "M3 3h7v9H3z M14 3h7v5h-7z M14 12h7v9h-7z M3 16h7v5H3z",
  map: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z M9 3v15 M15 6v15",
  building: "M4 21V3h12v18 M16 9h4v12 M8 7h4 M8 11h4 M8 15h4 M7 21h6 M19 13h1 M19 17h1",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  finance: "M12 2v20 M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16 M21 21l-4.35-4.35 M8 7h6 M8 11h3",
  brain: "M9.5 4.5A3 3 0 0 0 4 6v1a3 3 0 0 0-1 5.83V14a3 3 0 0 0 3 3h1a3 3 0 0 0 5 2.24V5.5a3 3 0 0 0-2.5-1 M14.5 4.5A3 3 0 0 1 20 6v1a3 3 0 0 1 1 5.83V14a3 3 0 0 1-3 3h-1a3 3 0 0 1-5 2.24 M8 10h8 M8 14h8",
  "user-cog": "M15 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 15v6 M16 18h6",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10 M9 12l2 2 4-4",
  scroll: "M6 3h12v18H6a3 3 0 0 1-3-3V6a3 3 0 0 0 3 3h12 M9 13h6 M9 17h6",
  mail: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M22 6l-10 7L2 6",
  languages: "M5 8l6 6 M4 14l6-6 2-3 M2 5h12 M7 2h1 M22 22l-5-10-5 10 M14 18h6",
  refresh: "M20 6v5h-5 M4 18v-5h5 M6.1 9a7 7 0 0 1 11.7-2.6L20 11 M4 13l2.2 4.6A7 7 0 0 0 17.9 15",
  alert: "M10.3 3.7 2.2 18a2 2 0 0 0 1.7 3h16.2a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0 M12 9v4 M12 17h.01",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20 M12 6v6l4 2",
  "eye-off": "m3 3 18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 4.2A10.7 10.7 0 0 1 12 4c5 0 8.8 4 10 8a16 16 0 0 1-2.2 3.2 M6.6 6.6A15 15 0 0 0 2 12c2.1 4 5.8 8 10 8 1.2 0 2.4-.3 3.4-.8",
  "check-circle": "M22 11.1V12a10 10 0 1 1-5.9-9.1 M22 4 12 14.01l-3-3",
  "arrow-up-right": "M7 17 17 7 M7 7h10v10",
  activity: "M3 12h4l2-7 4 14 2-7h6",
};
</script>
