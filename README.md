# MMM-WeatherChartD3

This is a module for the [MagicMirror²](https://github.com/MichMich/MagicMirror/).

This module displays a weather chart using any weather provider. It can display temperature, feels like temperature, precipitation, snow and weather icons.
It uses the [D3.js](https://d3js.org/) library.

![sample](images/sample.png)

## Using the module

To use this module, add the following configuration block to the modules array in the `config/config.js` file:

```js
var config = {
	modules: [
		{
			module: "MMM-WeatherChartD3",
			config: {
				updateInterval: 10 * 60 * 1000,
				initialLoadDelay: 0,
				weatherProvider: "openweathermap",
				weatherEndpoint: "/onecall",
				apiKey: "",
				type: "full", // "full" with "/onecall" is a hack in openweathermap provider
				expandDaySections: true, // Hack on openweathermap provider - used to split in 4 entries the 4 data of a day
				lang: config.language,
				lat: "",
				lon: "",
				units: config.units,
				locale: config.locale,
				d3jsVersion: "7", // can either be in format "7.3" or even "7.3.0"
				title: "Weather Forecast",
				height: 300,
				width: 500,
				iconSize: undefined, // in px or undefined to define automatically at first call
				iconURLBase: "https://raw.githubusercontent.com/erikflowers/weather-icons/master/svg/",
				hoursRatio: 0, // Ratio of fetched hours in graph (useful for openweathermap onecall that gives 48h with 1h precision) - 0 or undefined to ignore
				showMinMaxTemperature: false,
				showFeelsLikeTemp: true,
				showPrecipitation: true,
				showSnow: true, // if false: snow is included in precipitations
				showIcons: true,
				showNights: true,
				color: "#fff",
				fillColor: "rgba(255, 255, 255, 0.1)",
			}
		},
	]
}
```

## Installation

```sh
cd ~/MagicMirror/modules # Change path to modules directory of to your actual MagiMirror² installation
git clone https://github.com/seb-ma/MMM-WeatherChartD3
cd MMM-WeatherChartD3
npm install --only=production
```

## Configuration options

| Option                  | Description
|------------------------ |------------
| `updateInterval`        | *Optional* How often does the content needs to be fetched? (Milliseconds) <br><br>**Type:** `int`(milliseconds) <br>Default 100000 milliseconds (10 minutes)
| `initialLoadDelay`      | *Optional* The initial delay before loading. If you have multiple modules that use the same API key, you might want to delay one of the requests. (Milliseconds) <br><br>**Type:** `int`(milliseconds) <br>Default 0 milliseconds
| `weatherProvider`       | *Optional* Which weather provider should be used. <br>see https://github.com/MichMich/MagicMirror/tree/master/modules/default/weather/providers for list of available providers
| `weatherEndpoint`       | *Optional* The openweathermap API endPoint. <br>Possible values: `/onecall` , `/forecast` (free users) or `/forecast/daily` (paying users or old apiKey only) <br>Default value: `/onecall`
| `type`                  | *Optional* Which type of weather data should be displayed. <br>Possible values: `current` , `hourly` , `daily` , or specific value `full` which is a join of data from `hourly`+`daily` <br>Default value: `full`
| `expandDaySections`     | *Optional* Hack on openweathermap provider - used to split in 4 entries the 4 data of a day (morning, day, evening, night) instead of the single `day` value
| `apiKey`                | *Required* API key to fetch the weather provider 
| `lat`                   | *Required* Latitude of the location used for weather information. <br><br>**Type:** `float`
| `lon`                   | *Required* Longitude of the location used for weather information. <br><br>**Type:** `float`
| `lang`                  | *Optional* The language sent to provided. <br>Default value: uses value of `config.language`
| `units`                 | *Optional* What units to use. Specified by config.js <br>Default value: uses value of `config.units`
| `locale`                | *Optional* The locale of the days. <br>Default value: uses value of `config.locale`
| `d3jsVersion`           | *Optional* The D3 version to use. <br>Default value: "7" <br>Can either be in format "7.3" or even "7.3.0"
| `height`                | *Optional* Height of the chart area. <br><br>**Type:** `int` (pixels)<br>Default value: 300
| `width`                 | *Optional* Width of the chart area. <br><br>**Type:** `int` (pixels)<br>Default value: 500
| `iconSize`              | *Optional* Size of weather icons. Auto-define the maximum possible size that fits in chart if `undefined` <br><br>**Type:** `int` (pixels)<br>Default value: undefined
| `iconURLBase`           | *Optional* Base of the URL to retrieve icons<br> Default value: `https://raw.githubusercontent.com/erikflowers/weather-icons/master/svg/`
| `hoursRatio`            | *Optional* Ratio of fetched hours in graph (useful for openweathermap onecall that gives 48h with 1h precision) - 0 or undefined to ignore <br><br>**Type:** `float` (in [0 .. 1])<br>Default value: `0`
| `showMinMaxTemperature` | *Optional* Show a plot with min and max temperature for each day (if given by provider) <br><br>**Type:** `boolean`<br>Default value: `false`
| `showFeelsLikeTemp`     | *Optional* Show a plot with the "feels like" temperature (if given by provider) <br><br>**Type:** `boolean`<br>Default value: `true`
| `showPrecipitation`     | *Optional* Show a plot with precipitations (if given by provider). <br><br>**Type:** `boolean`<br>Default value: `true`
| `showSnow`              | *Optional* Show a plot with snow (if given by provider). Include snow in precipitations plot if set to `false` <br><br>**Type:** `boolean`<br>Default value: `false`
| `showIcons`             | *Optional* Show weather icons <br><br>**Type:** `boolean`<br>Default value: `true`
| `showNights`            | *Optional* Show a background color for nights <br><br>**Type:** `boolean`<br>Default value: `true`
| `color`                 | *Optional* Color used by plots <br>Default value: `#fff`
| `fillColor`             | *Optional* Color used to fill plots <br>Default value: `rgba(255, 255, 255, 0.1)`