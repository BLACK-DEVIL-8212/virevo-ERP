{import('tailwindcss').Config}
export default {
    content: ["./index.html","./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extends: {
            colors: {
                CrimsonRed : "#e62a33",
                FieryScarlet : "#ff3b42",
                DeepCarmine : "#d9242e",
                CherryRed : "#f02834",
                BrightVermilion : "#ff4a50",
                DarkRuby : "#cc1f29",
                ScarletBlaze : "#f52e3b",
                CoralPunch : "#ff5c62",
                BloodRed : "#b81a24",
                RosyScarlet : "#ff6f74",
                CardinalRed : "#c71e29",
                CarmineFlame : "#e91e2d",
                BurningEmber : "#f8313c",
                PoppyRed : "#ff5258",
                BrickRed : "#d31c27",
                BlushScarlet : "#ff6167",
                MaroonFlame : "#a4151f",
                SunsetRose : "#ff7378",
                CrimsonShadow : "#bf171f",
                RaspberryRed : "#f51f2b",
                SalmonGlow : "#ff868a",
                WineRed : "#91131b",
                CoralMist : "#ff999d",
                SanguineRed : "#d71521",
                BlushPink : "#ffb0b3",
                ChiliPepper : "#f01a26",
                ScarletFury : "#ff4248",
                RoseEmber : "#ff2f3a",
                LavaRed : "#ee1725",
                FirelightCrimson : "#f5222f",
            },
            container:{
                center:true,
                padding: {
                    DEFAULT: '1rem',
                    sm: '3rem',
                }
            }
        },
    },
    plugins: [],
}