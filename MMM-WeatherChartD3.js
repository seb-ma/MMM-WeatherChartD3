/**
 * This MagicMirror² module displays a weather chart using any weather provider.
 * It can display temperature, feels like temperature, precipitation, snow and weather icons.
 * It uses the D3.js library.
 * @module MMM-WeatherChartD3
 * @class Module
 * @see `README.md`
 * @author Sébastien Mazzon
 * @license MIT - @see `LICENCE.txt`
 */
"use strict";

Module.register("MMM-WeatherChartD3", {

	/**
	 * Default properties of the module
	 * @see `module.defaults`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#defaults>
	 */
	defaults: {
		updateInterval: 10 * 60 * 1000,
		initialLoadDelay: 0, // 0 seconds delay
		animationSpeed: 1000,
		weatherProvider: "openweathermap",
		weatherEndpoint: "/onecall",
		type: "full", // Possible values: hourly, forecast (=daily) or specific value `full` which is a join of data from hourly+daily
		apiKey: "",
		lat: "",
		lon: "",
		lang: config.language,
		units: config.units,
		locale: config.locale,
		d3jsVersion: "7", // can either be in format "7.4" or even "7.4.4"
		height: 300,
		width: 500,
		iconSize: undefined, // in px or undefined to define automatically at first call
		iconURLBase: "https://raw.githubusercontent.com/erikflowers/weather-icons/master/svg/",
		hoursRatio: 0, // Ratio of fetched hours in graph (useful for openweathermap onecall that gives 48h with 1h precision) - 0 or undefined to ignore
		showIcons: true,
		showNights: true,
		showTemperature: true,
		showMinMaxTemperature: false,
		showFeelsLikeTemp: true,
		showPrecipitationAmount: true,
		showPrecipitationProbability: true, // Only used when showPrecipitationAmount == true
		showSnow: true, // if false: snow is included in precipitations
		showPressure: true,
		showHumidity: true,
		showWind: true,
		showAQI: true,
		showUVI: true,
	},

	/**
	 * Number of calls to `updateAvailable` before triggering `updateDom` (set by `scheduleUpdate`)
	 */
	nbUpdateWait: 0,

	/**
	 * Initializes module
	 * @see `module.start`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#start>
	 */
	start: function () {
		// Initializes and starts the weather provider
		this.weatherProvider = WeatherProvider.initialize(this.config.weatherProvider, this);
		this.weatherProvider.start();

		// Loads D3 locale
		(async () => {
			await d3.json(`https://unpkg.com/d3-time-format@2/locale/${this.config.locale}.json`).then(function (locale) {
				d3.timeFormatDefaultLocale(locale);
			});
		})();

		// Schedules the first update
		this.scheduleUpdate(this.config.initialLoadDelay);
	},

	/**
	 * Returns the CSS files used by getDom
	 * @see `module.getStyles`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#getstyles>
	 * @returns {Array}
	 */
	getStyles: function () {
		return [`${this.name}.css`];
	},

	/**
	 * Returns the scripts necessary for the chart and weather provider
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#getscripts>
	 * @returns {string[]} An array with filenames
	 */
	getScripts: function () {
		const pathWeather = "modules/default/weather/";
		return [
			// Loads d3 from CDN
			`https://cdn.jsdelivr.net/npm/d3@${this.config.d3jsVersion}/dist/d3.min.js`,
			"suncalc.js",
			`${pathWeather}providers/${this.config.weatherProvider.toLowerCase()}.js`,
		];
	},

	/**
	 * Called when the provider has retrieved data
	 */
	updateAvailable: function () {
		this.nbUpdateWait--;
		if (this.nbUpdateWait <= 0) {
			// No more waiting call - update DOM with all the available data and schedule next update
			Log.log("New weather information available.");
			this.updateDom(this.config.animationSpeed);
			this.scheduleUpdate();
		}
	},

	/**
	 * Called when the module is hidden
	 * @see `module.suspend`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#suspend>
	 */
	suspend: function () {
		// Stop scheduled updates
		if (this.timer) {
			clearTimeout(this.timer);
		}
	},

	/**
	 * Called when the module is shown
	 * @see `module.resume`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#resume>
	 */
	resume: function () {
		// Instantly restart scheduled updates
		this.scheduleUpdate(0);
	},

	/**
	 * Schedules next data retrieving
	 * @param {integer} delay Delay before updating - use config.updateInterval if null
	 */
	scheduleUpdate: function (delay = null) {
		let nextLoad = this.config.updateInterval;
		if (delay !== null && delay >= 0) {
			nextLoad = delay;
		}

		this.timer = setTimeout(() => {
			switch (this.config.type.toLowerCase()) {
				case "hourly":
					this.nbUpdateWait = 1;
					this.weatherProvider.fetchWeatherHourly();
					break;
				case "daily":
				case "forecast":
					this.nbUpdateWait = 1;
					this.weatherProvider.fetchWeatherForecast();
					break;
				case "full":
					this.nbUpdateWait = 2;
					if (this.config.showAQI && typeof this.weatherProvider.fetchCurrentPollution === "function") {
						this.nbUpdateWait++;
						this.weatherProvider.fetchPollutionForecast();
					}
					this.weatherProvider.fetchWeatherHourly();
					this.weatherProvider.fetchWeatherForecast();
					break;
				default:
					this.nbUpdateWait = 0;
					Log.error(`Invalid type ${this.config.type} configured (must be one of 'hourly', 'daily', 'forecast' or 'full')`);
			}
		}, nextLoad);
	},

	/**
	 * Returns value or a fallback if value is not a number
	 * @param {*} value Value to check
	 * @param {*} fallback Fallback value
	 * @returns Fallback if value if is null or not a number, else: value
	 */
	ifNan: function (value, fallback) {
		return (isNaN(value) || value === null) ? fallback : value;
	},

	/**
	 * Generates the DOM containing the chart
	 *
	 * @see `module.getDom`
	 * @see <https://docs.magicmirror.builders/development/core-module-file.html#getdom>
	 * @returns {HTMLElement|Promise} The DOM to display
	 */
	getDom: function () {
		const promises = [];
		const ifDef = (value, fallback) => (typeof (value) === "undefined" || value === null) ? fallback : value;

		const dataHourly = ifDef(this.weatherProvider.weatherHourly(), []);
		let dataDaily = ifDef(this.weatherProvider.weatherForecast(), []);
		const dataPollution = ifDef(this.weatherProvider.pollutionForecast(), []);

		if (dataHourly.length > 0 || dataDaily.length > 0) {
			if (dataHourly.length > 0 && dataDaily.length > 0) {
				// Remove current day and next day of dataDaily (provided by dataHourly)
				const dateMaxHourly = d3.max(dataHourly, d => d.date);
				dataDaily = dataDaily.filter(d => d.date.isAfter(dateMaxHourly));
			}
			// Merge and sort data
			const sortedData = d3.sort([].concat(dataHourly).concat(dataDaily), d => d.date);

			// Frame
			const margins = { top: 0, right: 10, bottom: 30, left: 10 };
			const legendBarWidth = 55;
			const innerWidth = this.config.width - margins.left - margins.right - 2 * legendBarWidth;

			// Define x scale
			let xTime;
			if (dataHourly.length > 0 && dataDaily.length > 0) {
				let rangeX = [0, innerWidth];
				let domainX = [d3.min(dataHourly, d => d.date), d3.max(dataDaily, d => d.date)];
				if (this.ifNan(this.config.hoursRatio, 0) !== 0) {
					rangeX = [0, innerWidth * (1 - this.config.hoursRatio), innerWidth];
					domainX = [d3.min(dataHourly, d => d.date), d3.min(dataDaily, d => d.date), d3.max(dataDaily, d => d.date)];
				}
				xTime = d3.scaleTime()
					.domain(domainX)
					.range(rangeX);
			} else {
				xTime = d3.scaleTime()
					.domain(d3.extent(sortedData, d => d.date))
					.range([0, innerWidth]);
			}

			// Define icon size and gap between icons
			if (this.config.iconSize === undefined) {
				let minDelta = Infinity;
				for (var i = 1; i < sortedData.length; i++) {
					const delta = xTime(sortedData[i].date) - xTime(sortedData[i - 1].date)
					if (minDelta > delta) {
						minDelta = delta;
					}
				}
				const magnifier = this.config.width / minDelta / 30; // Empiric value
				this.config.iconSize = minDelta * magnifier;
			}

			// Frame
			margins.top = this.config.iconSize;
			const innerHeight = this.config.height - margins.top - margins.bottom - legendBarWidth;

			// Remove existing svg
			d3.select(`#${this.identifier} svg`).remove();
			// Adds new svg
			const svg = d3.select(`#${this.identifier}`)
				.append("svg")
				.attr("width", this.config.width)
				.attr("height", this.config.height)
				.append("g")
				.attr("id", "grp")
				.attr("transform", `translate(${margins.left + legendBarWidth}, ${margins.top})`);

			// Adds Y axis (temperature)
			const yTemp = d3.scaleLinear()
				.domain([
					d3.min(sortedData, d => Math.min(this.ifNan(d.temperature, 0), this.ifNan(d.minTemperature, 0), this.ifNan(d.feelsLikeTemp, 0)) - 1),
					d3.max(sortedData, d => Math.max(this.ifNan(d.temperature, 40), this.ifNan(d.maxTemperature, 40), this.ifNan(d.feelsLikeTemp, 40)) + 1)
				])
				.range([innerHeight, 0]);

			// Adds grids and axis
			promises.push(this.addGridAndAxis(svg, dataHourly, dataDaily, xTime, innerHeight, legendBarWidth));

			// Adds day/night
			if (this.config.showNights && sortedData.length > 1) {
				promises.push(this.svgAddDayNight(svg, sortedData, xTime, innerWidth, innerHeight, margins, legendBarWidth));
			}
			// Adds precipitation (rain/snow)
			if (this.config.showPrecipitationAmount) {
				promises.push(this.svgAddPrecipitation(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds pressure
			if (this.config.showPressure) {
				promises.push(this.svgAddPressure(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds temperature min/max
			if (this.config.showMinMaxTemperature) {
				promises.push(this.svgAddTemperatureMinMax(svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp));
			}
			// Adds temperature
			if (this.config.showTemperature) {
				promises.push(this.svgAddTemperature(svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp));
			}
			// Adds feels alike temperature
			if (this.config.showFeelsLikeTemp) {
				promises.push(this.svgAddFeelsAlikeTemperature(svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp));
			}
			// Adds weather icons
			if (this.config.showIcons) {
				promises.push(this.svgAddWeatherIcons(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds Humidity
			if (this.config.showHumidity) {
				promises.push(this.svgAddHumidity(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds Wind
			if (this.config.showWind) {
				promises.push(this.svgAddWind(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds UVI
			if (this.config.showUVI) {
				promises.push(this.svgAddUvi(svg, sortedData, xTime, innerWidth, innerHeight, margins));
			}
			// Adds AQI
			if (this.config.showAQI) {
				promises.push(this.svgAddAqi(svg, dataPollution, xTime, innerWidth, innerHeight, margins));
			}
		}

		// SVG is directly added into div module
		return Promise.all(promises).then(() => document.createElement("div"));
	},

	/**
	 * Returns an array without intermediate values (only local min and max values)
	 * @param {Array} data Array to filter
	 * @param {Function} fctGet Function to be called with an item of data to get value 
	 * @param {Number} minDelta Minimum delta between 2 values to keep it - undefined to ignore
	 * @returns {Array} data with only local min/max values
	 */
	keepExtremes: function (data, fctGet, minDelta) {
		let direction = data.length <= 1 || fctGet(data[1]) > fctGet(data[0]) ? -1 : 1;
		const startIndexToDisplay = 2; // Don't keep first value to avoid display on left axis
		const result = [];
		let lastValue = Number.MAX_SAFE_INTEGER;
		for (let i = startIndexToDisplay; i < data.length; i++) {
			const d0 = fctGet(data[i - 1]);
			const d1 = fctGet(data[i]);
			if (i == data.length - 1 || (direction > 0 && d1 < d0) || (direction < 0 && d1 > d0)) {
				direction *= -1;
				if (minDelta === undefined || Math.abs(d0 - lastValue) > minDelta) {
					lastValue = d0;
					result.push(data[i - 1]);
				}
			}
		}
		return result;
	},

	/**
	 * Adds grids and axis to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} dataHourly Data of weatherHourly
	 * @param {Array} dataDaily Data of weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {integer} legendBarWidth Width of the legend (in pixels)
	 */
	addGridAndAxis: async function (svg, dataHourly, dataDaily, xTime, innerHeight, legendBarWidth) {
		// X axis (date)
		svg.append("g")
			.attr("id", "x-axis-hours")
			.attr("class", "x-axis")
			.attr("transform", `translate(0, ${innerHeight})`)
			.call(d3.axisBottom(xTime)
				.tickValues(d3.timeHour.every(3).range(d3.min(dataHourly, d => d.date), d3.max(dataHourly, d => d.date))
					.concat(d3.timeHour.every(6).range(d3.min(dataDaily, d => d.date), d3.max(dataDaily, d => d.date))))
				.tickFormat(d3.timeFormat("%Hh"))
			);

		// Rotate hours legend
		svg.selectAll("#x-axis-hours text")
			.attr("text-anchor", "end")
			.attr("dx", "-0.8em")
			.attr("dy", "0.15em")
			.attr("transform", "rotate(-65)");

		// X gridline
		svg.append("g")
			.attr("id", "x-axis-days")
			.attr("class", "x-axis-grid")
			.attr("transform", `translate(0, ${innerHeight})`)
			.call(d3.axisBottom(xTime)
				.ticks(d3.timeDay.every(1))
				.tickSize(-innerHeight, 0, 0).tickPadding(legendBarWidth)
				.tickFormat(d3.timeFormat("%a %d")))
			// Shift text to start of tick
			.selectAll("text").attr("text-anchor", "start");
	},

	/**
	 * Adds day/night to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddDayNight: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins, legendBarWidth) {
		let sunTimesData = [];
		var iterd = sortedData[0].date;
		while (iterd <= sortedData[sortedData.length - 1].date) {
			sunTimesData.push(SunCalc.getTimes(iterd, this.config.lat, this.config.lon));
			iterd = iterd.clone().add(1, "d");
		}

		const fctNightWidth = (d1, d2) => Math.min(innerWidth, d2 ? xTime(d2.sunrise) : innerWidth) - Math.max(0, xTime(d1.sunset));

		// In graph
		svg.selectAll("grp").append("g")
			.data(sunTimesData).enter()
			.append("rect")
			.attr("class", "night")
			.attr("x", d => Math.max(xTime(d.sunset), 0))
			.attr("y", -this.config.iconSize)
			.attr("width", (d, i) => fctNightWidth(d, sunTimesData[i + 1]))
			.attr("height", innerHeight + this.config.iconSize);
		// In axis
		svg.selectAll("grp").append("g")
			.data(sunTimesData).enter()
			.append("rect")
			.attr("class", "axis-night")
			.attr("x", d => Math.max(xTime(d.sunset), 0))
			.attr("y", innerHeight)
			.attr("width", (d, i) => fctNightWidth(d, sunTimesData[i + 1]))
			.attr("height", legendBarWidth);
	},

	/**
	 * Adds precipitation and snow to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddPrecipitation: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		let data = sortedData.filter(d => d.precipitationAmount !== undefined);

		// Add slot duration in ms
		data.forEach((d, i) => d.period = Math.abs(d.date.diff(data[i + (i + 1 < data.length ? 1 : -1)].date)));

		data = data.filter(d => d.precipitationAmount !== null);

		const self = this;
		const getHeightPrecipitation = function (d, withRain = true, withSnow = true) {
			const deltaInHours = d.period / (60 * 60 * 1000); // ms to hours
			const precipitations = (withRain ? d.rain ?? 0 : 0) + (withSnow ? d.snow ?? 0 : 0);
			return parseFloat((precipitations / deltaInHours).toFixed(2));
		}

		/*
		// Y axis
		svg.append("g")
			.attr("class", "y-axis")
			.attr("transform", `translate(${innerWidth}, 0)`)
			.call(d3.axisRight(yAxis));
		*/

		if (data.length > 0) {
			const maxPrecipitations = d3.max(data, d => getHeightPrecipitation(d));
			const minDelta = d3.min(data, d => d.period);

			const yAxis = d3.scaleLinear()
				.domain([0, Math.max(5, maxPrecipitations)]) // world record: ~300mm for an hour
				.range([innerHeight, 0]);

			// Y axis icon
			svg.append("image")
				.attr("class", "precipitation axis-icon")
				.attr("x", -this.config.iconSize / 2)
				.attr("y", yAxis(maxPrecipitations) - this.config.iconSize / 4)
				.attr("xlink:href", `${this.config.iconURLBase}/wi-raindrop.svg`)
				.attr("width", this.config.iconSize / 2);

			// Y axis (rain) label
			svg.append("text")
				.attr("class", "rain axis-label")
				.attr("x", innerWidth + margins.left)
				.attr("y", yAxis(getHeightPrecipitation(data[data.length - 1])))
				.attr("text-anchor", "start")
				.text(this.config.units === "imperial" ? "in/h" : "mm/h");

			// Rain/precipitations
			svg.selectAll("grp").append("g")
				.data(data).enter()
				.append("rect")
				.attr("class", "precipitation curve")
				.attr("x", d => xTime(d.date))
				.attr("y", yAxis(0))
				.attr("transform", d => `translate(0, ${-yAxis(0) + yAxis(getHeightPrecipitation(d, true, !this.config.showSnow))})`)
				.attr("width", d => Math.min(innerWidth, xTime(d.date + d.period)) - xTime(d.date))
				.attr("height", d => yAxis(0) - yAxis(getHeightPrecipitation(d, true, !this.config.showSnow)));

			if (this.config.showSnow) {
				// Snow
				svg.selectAll("grp").append("g")
					.data(data.filter(d => d.snow && d.snow !== null)).enter()
					.append("rect")
					.attr("class", "snow curve")
					.attr("x", d => xTime(d.date))
					.attr("y", yAxis(0))
					.attr("transform", d => `translate(0, ${-yAxis(0) + yAxis(getHeightPrecipitation(d, false, true))})`)
					.attr("width", d => Math.min(innerWidth, xTime(d.date + d.period)) - xTime(d.date))
					.attr("height", d => yAxis(0) - yAxis(getHeightPrecipitation(d, false, true)));
			}

			// Precipitation probability
			let getProba = (d) => "";
			if (this.config.showPrecipitationProbability) {
				getProba = (d) => `(${d.precipitationProbability.toFixed(0)}%)`;
			}

			const dataExtremes = this.keepExtremes(data, d => getHeightPrecipitation(d), 0.5);
			// Local min/max values as text
			svg.selectAll("grp")
				.data(dataExtremes).enter()
				.append("text")
				.attr("class", "precipitation curve-value")
				.attr("text-anchor", "start")
				.attr("x", d => xTime(d.date))
				.attr("y", d => yAxis(getHeightPrecipitation(d)))
				.text(d => `${(getHeightPrecipitation(d)).toFixed(1)} ${getProba(d)}`);
		}
	},

	/**
	 * Adds min/max temperature to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 * @param {d3.scaleLinear} yTemp Y-axis scale (temperature)
	 */
	svgAddTemperatureMinMax: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp) {
		svg.append("path")
			.datum(sortedData.filter(d => d.minTemperature && d.minTemperature !== null && d.minTemperature && d.minTemperature !== null))
			.attr("class", "min-max-temperature curve")
			.attr("d", d3.area().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y0(d => yTemp(parseFloat(d.minTemperature.toFixed(1))))
				.y1(d => yTemp(parseFloat(d.maxTemperature.toFixed(1))))
			);
	},

	/**
	 * Adds temperature to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 * @param {d3.scaleLinear} yTemp Y-axis scale (temperature)
	 */
	svgAddTemperature: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp) {
		const data = sortedData.filter(d => d.temperature && d.temperature !== null);
		const getValue = d => parseFloat(d.temperature.toFixed(1));

		/*
		// Y axis
		svg.append("g")
			.attr("class", "y-axis")
			.call(d3.axisLeft(yTemp));
		*/

		// Y axis icon
		svg.append("image")
			.attr("class", "temperature axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yTemp(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-thermometer.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "temperature axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yTemp(getValue(data[data.length - 1])))
			.text(this.config.units === "imperial" ? "°F" : "°C");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "temperature curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yTemp(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 1);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "temperature curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yTemp(getValue(d)))
			.attr("dy", (d, i) => `${((i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) || (i == 0 && getValue(d) > getValue(dataExtremes[i + 1]))) ? -0.75 : 1.5}em`)
			.text(d => getValue(d));
	},

	/**
	 * Adds feels alike temperature to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 * @param {d3.scaleLinear} yTemp Y-axis scale (temperature)
	 */
	svgAddFeelsAlikeTemperature: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins, yTemp) {
		const data = sortedData.filter(d => d.feelsLikeTemp && d.feelsLikeTemp !== null);
		const getValue = d => parseFloat(d.feelsLikeTemp.toFixed(1));

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "feelsLikeTemp curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yTemp(getValue(d)))
			);
	},

	/**
	 * Adds weather icons to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddWeatherIcons: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins,) {
		let lastIcon = undefined; // static
		function differentThanPrevious(d) {
			const res = d.weatherType && lastIcon !== d.weatherType;
			lastIcon = d.weatherType;
			return res;
		}

		const dataIcons = sortedData.filter(differentThanPrevious) // Display only icons that are different from previous
		let lastPosNb = 1;
		let sumLastStack = 0;
		// Un-align icons if previous is too close
		function yAxis(d, i) {
			let nb = 1;
			if (i > 0) {
				nb = (xTime(d.date) - xTime(dataIcons[i - 1].date)) / this.config.iconSize;
			}
			sumLastStack += nb * this.config.iconSize;
			if (nb < 1 && sumLastStack < this.config.iconSize) {
				return -this.config.iconSize + lastPosNb++ * this.config.iconSize / 1.5;
			} else {
				sumLastStack = 0;
				lastPosNb = 1;
				return -this.config.iconSize;
			}
		}

		// Icons
		svg.selectAll("grp").append("g")
			.data(dataIcons).enter()
			.append("image") // NB: Adding text with classes "wi weathericon" does not work, so: using svg instead
			.attr("class", "weather curve")
			.attr("xlink:href", d => `${this.config.iconURLBase}/wi-${d.weatherType}.svg`)
			.attr("x", d => xTime(d.date))
			.attr("y", yAxis.bind(this))
			.attr("width", this.config.iconSize);
	},

	/**
	 * Adds pressure to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddPressure: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		const data = sortedData.filter(d => d.pressure && d.pressure !== null);
		const getValue = d => parseFloat(d.pressure.toFixed(0));

		const yAxis = d3.scaleLinear()
			.domain([Math.min(950, d3.min(data, d => getValue(d))), Math.max(1050, d3.max(data, d => getValue(d)))])
			.range([innerHeight, 0]);

		// Y axis icon
		svg.append("image")
			.attr("class", "pressure axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yAxis(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-barometer.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "pressure axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yAxis(getValue(data[data.length - 1])))
			.text("hPa");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "pressure curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yAxis(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 1);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "pressure curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yAxis(getValue(d)))
			.attr("dy", (d, i) => `${(i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) ? -0.75 : 1}em`)
			.text(d => getValue(d));
	},

	/**
	 * Adds humidity to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddHumidity: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		const data = sortedData.filter(d => d.humidity && d.humidity !== null);
		const getValue = d => parseFloat(d.humidity.toFixed(0));

		const yAxis = d3.scaleLinear()
			.domain([0, 100])
			.range([innerHeight, 0]);

		// Y axis icon
		svg.append("image")
			.attr("class", "humidity axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yAxis(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-humidity.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "humidity axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yAxis(getValue(data[data.length - 1])))
			.text("%");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "humidity curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yAxis(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 4);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "humidity curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yAxis(getValue(d)))
			.attr("dy", (d, i) => `${(i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) ? -0.75 : 1}em`)
			.text(d => getValue(d));
	},

	/**
	 * Adds wind to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddWind: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		const data = sortedData.filter(d => d.windSpeed && d.windSpeed !== null);
		const getValue = d => parseFloat(d.windSpeed.toFixed(0));

		const yAxis = d3.scaleLinear()
			.domain([0, Math.max(50, d3.max(data, d => getValue(d)))])
			.range([innerHeight, 0]);

		// Y axis icon
		svg.append("image")
			.attr("class", "wind axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yAxis(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-strong-wind.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "wind axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yAxis(getValue(data[data.length - 1])))
			.text(this.config.units === "imperial" ? "mi/h" : "km/h");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "wind curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yAxis(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 1);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "wind curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yAxis(getValue(d)))
			.attr("dy", (d, i) => `${(i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) ? -0.75 : 1}em`)
			.text(d => getValue(d));
	},

	/**
	 * Adds UVI to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData Concatenation of weatherHourly and weatherDaily
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddUvi: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		const data = sortedData.filter(d => d.uvi && d.uvi !== null);
		const getValue = d => parseFloat(d.uvi.toFixed(1));

		const yAxis = d3.scaleLinear()
			.domain([0, Math.max(10, d3.max(data, d => getValue(d)))])
			.range([innerHeight, 0]);

		// Y axis icon
		svg.append("image")
			.attr("class", "uvi axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yAxis(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-day-sunny.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "uvi axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yAxis(getValue(data[data.length - 1])))
			.text("UV");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "uvi curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(0.3))
				.x(d => xTime(d.date))
				.y(d => yAxis(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 1);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "uvi curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yAxis(getValue(d)))
			.attr("dy", (d, i) => `${(i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) ? -0.75 : 1}em`)
			.text(d => getValue(d));
	},

	/**
	 * Adds AQI to SVG
	 * @param {svg} svg SVG of the chart
	 * @param {Array} sortedData pollutionForecast
	 * @param {d3.scaleTime} xTime X-axis scale (time)
	 * @param {integer} innerWidth Width of the chart (in pixels)
	 * @param {integer} innerHeight Height of the chart (in pixels)
	 * @param {top, right, bottom, left} margins Margins of the chart (in pixels)
	 */
	svgAddAqi: async function (svg, sortedData, xTime, innerWidth, innerHeight, margins) {
		const data = sortedData.filter(d => d.aqi && d.aqi !== null);
		const getValue = d => parseFloat(d.aqi.toFixed(1));

		const yAxis = d3.scaleLinear()
			.domain([Math.max(5, d3.max(data, d => getValue(d))), Math.max(1, d3.min(data, d => getValue(d)))])
			.range([innerHeight, 2 * this.config.iconSize]);

		// Y axis icon
		svg.append("image")
			.attr("class", "aqi axis-icon")
			.attr("x", -this.config.iconSize / 2)
			.attr("y", yAxis(getValue(data[0])) - this.config.iconSize / 4)
			.attr("xlink:href", `${this.config.iconURLBase}/wi-train.svg`)
			.attr("width", this.config.iconSize / 2);

		// Y axis label
		svg.append("text")
			.attr("class", "aqi axis-label")
			.attr("text-anchor", "start")
			.attr("x", innerWidth + margins.left)
			.attr("y", yAxis(getValue(data[data.length - 1])))
			.text("AQI");

		// Curve
		svg.append("path")
			.datum(data)
			.attr("class", "aqi curve")
			.attr("d", d3.line().curve(d3.curveCardinal.tension(1))
				.x(d => xTime(d.date))
				.y(d => yAxis(getValue(d)))
			);

		const dataExtremes = this.keepExtremes(data, d => getValue(d), 0.5);
		// Local min/max values as text
		svg.selectAll("grp")
			.data(dataExtremes).enter()
			.append("text")
			.attr("class", "aqi curve-value")
			.attr("text-anchor", "middle")
			.attr("x", d => xTime(d.date))
			.attr("y", d => yAxis(getValue(d)))
			.attr("dy", (d, i) => `${(i > 0 && getValue(d) > getValue(dataExtremes[i - 1])) ? 1 : -0.75}em`)
			.text(d => getValue(d));
	},

});
