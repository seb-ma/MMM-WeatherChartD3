/* Magic Mirror
 * Module: MMM-Bosch-BME680-sensor
 *
 * By Sébastien Mazzon
 * MIT Licensed.
 */

Module.register("MMM-WeatherChartD3", {
	defaults: {
		updateInterval: 10 * 60 * 1000,
		initialLoadDelay: 0, // 0 seconds delay
		weatherProvider: "openweathermap",
		weatherEndpoint: "/onecall",
		type: "full", // "full" with "/onecall" is a hack in openweathermap provider
		expandDaySections: true, // Hack on openweather provider - used to split in 4 entries the 4 data of a day
		apiKey: "",
		lat: "",
		lon: "",
		lang: config.language,
		units: config.units,
		locale: config.locale,
		d3jsVersion: "7", // can either be in format "7.3" or even "7.3.0"
		height: 300,
		width: 500,
		iconSize: undefined, // in px or undefined to define automatically at first call
		iconURLBase: "https://raw.githubusercontent.com/erikflowers/weather-icons/master/svg/",
		hoursRatio: 0, // Ratio of fetched hours in graph (usefull for openweathermap onecall that gives 48h with 1h precision) - 0 or undefined to ignore
		showMinMaxTemperature: false,
		showFeelsLikeTemp: true,
		showPrecipitation: true,
		showSnow: true, // if false: snow is included in precipitations
		showIcons: true,
		showNights: true,
		color: "#fff",
		fillColor: "rgba(255, 255, 255, 0.1)",
	},

	start: function () {
		// Initialize the weather provider.
		this.weatherProvider = WeatherProvider.initialize(this.config.weatherProvider, this);
		// Let the weather provider know we are starting.
		this.weatherProvider.start();

		(async () => {
			await d3.json(`https://unpkg.com/d3-time-format@2/locale/${this.config.locale}.json`).then(function (locale) {
				d3.timeFormatDefaultLocale(locale);
			});
		})();
		// Schedule the first update.
		this.scheduleUpdate(this.config.initialLoadDelay);
	},

	updateAvailable: function () {
		Log.log("New weather information available.");
		this.updateDom(0);
		this.scheduleUpdate();
	},

	suspend: function () {
		if (this.timer) {
			clearTimeout(this.timer);
		}
	},

	resume: function () {
		this.scheduleUpdate();
	},

	/* scheduleUpdate()
	 * Schedule next update.
	 *
	 * argument delay number - Milliseconds before next update.
	 *  If empty, this.config.updateInterval is used.
	 */
	scheduleUpdate: function (delay = null) {
		let nextLoad = this.config.updateInterval;
		if (delay !== null && delay >= 0) {
			nextLoad = delay;
		}

		this.timer = setTimeout(() => {
			switch (this.config.type.toLowerCase()) {
				case "hourly":
					this.weatherProvider.fetchWeatherHourly();
					break;
				case "daily":
				case "forecast":
					this.weatherProvider.fetchWeatherForecast();
					break;
				case "full":
					if (this.config.weatherEndpoint === "/onecall"
						&& typeof this.weatherProvider.fetchWeatherAll === "function") {
						this.weatherProvider.fetchWeatherAll();
					} else {
						this.weatherProvider.fetchWeatherHourly();
						this.weatherProvider.fetchWeatherForecast();
					}
					break;
				default:
					Log.error(`Invalid type ${this.config.type} configured (must be one of 'hourly', 'daily' or 'forecast')`);
			}
		}, nextLoad);
	},

	getDom: function () {
		self = this;

		function ifNan(value, fallback) { return (isNaN(value) || value === null) ? fallback : value; }
		function ifDef(value, fallback) { return (typeof (value) === "undefined" || value === null) ? fallback : value; }

		let dataHourly, dataDaily;
		if (this.config.type === "hourly" || this.config.type === "full") {
			dataHourly = this.weatherProvider.weatherHourly()
		}
		if (this.config.type === "daily" || this.config.type === "full") {
			dataDaily = this.weatherProvider.weatherForecast()
		}

		if ((dataHourly !== undefined && dataHourly != null) || (dataDaily !== undefined && dataDaily != null)) {
			if (dataHourly && dataDaily) {
				// Remove current day and next day (provided by dataHourly)
				const dateMaxHourly = d3.max(dataHourly, d => d.date);
				dataDaily = dataDaily.filter(d => d.date.isAfter(dateMaxHourly));
			}
			// Merge and sort data
			const sortedData = d3.sort([].concat(ifDef(dataHourly, [])).concat(ifDef(dataDaily, [])), d => d.date);

			// Frame
			const margin = { top: 0, right: 10, bottom: 30, left: 10 };
			const legendBarWidth = 55;
			const innerWidth = this.config.width - margin.left - margin.right - 2 * legendBarWidth;

			// Define x scale
			let xTime;
			if (dataHourly && dataDaily) {
				let rangeX = [0, innerWidth];
				let domainX = [d3.min(dataHourly, d => d.date), d3.max(dataDaily, d => d.date)];
				if (ifNan(this.config.hoursRatio, 0) !== 0) {
					rangeX = [0, innerWidth * (1 - this.config.hoursRatio), innerWidth];
					domainX = [d3.min(dataHourly, d => d.date), d3.max(dataHourly, d => d.date), d3.max(dataDaily, d => d.date)];
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
				const magnifier = this.config.width / minDelta / 25; // Empiric value
				this.config.iconSize = minDelta * magnifier;
			}

			// Frame
			margin.top = this.config.iconSize;
			const innerHeight = this.config.height - margin.top - margin.bottom - legendBarWidth;

			// Remove existing svg
			d3.select(`#${this.identifier} svg`).remove();
			// Add new svg
			const svg = d3.select(`#${this.identifier}`)
				.append("svg")
				.attr("width", this.config.width)
				.attr("height", this.config.height)
				.append("g")
				.attr("id", "grp")
				.attr("transform", `translate(${margin.left + legendBarWidth}, ${margin.top})`);

			// Add X axis (date)
			svg.append("g")
				.attr("id", "x-axis-hours")
				.attr("class", "x-axis")
				.attr("transform", `translate(0, ${innerHeight})`)
				.call(d3.axisBottom(xTime)
					.tickValues(d3.timeHour.every(3).range(d3.min(dataHourly, d => d.date), d3.max(dataHourly, d => d.date))
						.concat(d3.timeHour.every(6).range(d3.min(dataDaily, d => d.date), d3.max(dataDaily, d => d.date))))
					.tickFormat(d3.timeFormat('%Hh'))
				);

			// Rotate hours legend
			svg.selectAll("#x-axis-hours text")
				.style("text-anchor", "end")
				.attr("dx", "-.8em")
				.attr("dy", ".15em")
				.attr("transform", "rotate(-65)");


			// Add X gridline
			svg.append("g")
				.attr("id", "x-axis-days")
				.attr("class", "x-axis-grid")
				.attr("transform", `translate(0, ${innerHeight})`)
				.call(d3.axisBottom(xTime)
					.ticks(d3.timeDay.every(1))
					.tickSize(-innerHeight, 0, 0).tickPadding(legendBarWidth)
					.tickFormat(d3.timeFormat('%a %d')))
				// Shift text to start of tick
				.selectAll("text").style("text-anchor", "start");

			// Add Y axis (temperature)
			const yTemp = d3.scaleLinear()
				.domain([d3.min(sortedData, d => Math.min(ifNan(d.temperature, Infinity), ifNan(d.minTemperature, Infinity), ifNan(d.feelsLikeTemp, Infinity)) - 1),
				d3.max(sortedData, d => Math.max(ifNan(d.temperature, -Infinity), ifNan(d.maxTemperature, -Infinity), ifNan(d.feelsLikeTemp, -Infinity)) + 1)])
				.range([innerHeight, 0]);

			svg.append("g")
				.attr("class", "y-axis")
				.call(d3.axisLeft(yTemp));

			// Y axis (temperature) label
			svg.append("text")
				.style("text-anchor", "end")
				.attr("class", "y-axis-label")
				.attr("x", -margin.left)
				.attr("y", -10)
				.attr("text-anchor", "start")
				.text(this.config.units === "imperial" ? "°F" : "°C");

			// Add day/night
			if (this.config.showNights) {
				let sunTimesData = [];
				var iterd = sortedData[0].date;
				while (iterd <= sortedData[sortedData.length - 1].date) {
					sunTimesData.push(SunCalc.getTimes(iterd, this.config.lat, this.config.lon));
					iterd = iterd.clone().add(1, 'd');
				}

				function fctNightWidth(d1, d2) {
					return Math.min(innerWidth, d2 ? xTime(d2.sunrise) : innerWidth) - Math.max(0, xTime(d1.sunset));
				}

				svg.selectAll("grp")
					.append("g")
					.data(sunTimesData)
					.enter()
					.append("rect")
					.attr("class", "night")
					.attr("x", d => Math.max(xTime(d.sunset), 0))
					.attr("y", -self.config.iconSize)
					.attr("width", (d, i) => fctNightWidth(d, sunTimesData[i + 1]))
					.attr("height", innerHeight + self.config.iconSize)
					.attr('opacity', 0.05);
			}

			// Add precipitation (rain/snow)
			if (this.config.showPrecipitation) {
				const yPrecip = d3.scaleLinear()
					.domain([0, d3.max(sortedData, d => ifNan(d.precipitation, 5))]) // world record: ~300mm for an hour
					.range([innerHeight, 0]);

				// Add Y axis (rain)
				svg.append("g")
					.attr("class", "y-axis")
					.attr("transform", `translate(${innerWidth}, 0)`)
					.call(d3.axisRight(yPrecip));

				// Y axis (rain) label
				svg.append("text")
					.attr("class", "y-axis-label")
					.attr("x", innerWidth + margin.left)
					.attr("y", -10)
					.attr("text-anchor", "start")
					.text(this.config.units === "imperial" ? "in" : "mm");

				// Add rain/precipitations
				svg.append("path")
					.attr("id", "precipitation")
					.datum(sortedData)
					.attr("fill", this.config.fillColor)
					.attr("stroke", this.config.color)
					.attr("stroke-width", 1.5)
					.attr('opacity', 1)
					.attr("d", d3.area().curve(d3.curveMonotoneX)
						.x(d => xTime(d.date))
						.y0(d => yPrecip(0))
						.y1(d => yPrecip(this.config.showSnow ? ifNan(d.rain, 0) : ifNan(d.precipitation, 0))) // Include snow if not displayed separtly
					);

				if (this.config.showSnow)
					// Add snow
					svg.append("path")
						.attr("id", "snow")
						.datum(sortedData)
						.attr("fill", this.config.fillColor)
						.attr("stroke", this.config.color)
						.attr("stroke-dasharray", "10,2")
						.attr("stroke-width", 1)
						.attr('opacity', 0.7)
						.attr("d", d3.area().curve(d3.curveMonotoneX)
							.x(d => xTime(d.date))
							.y0(d => yPrecip(0))
							.y1(d => yPrecip(ifNan(d.snow, 0)))
						);
			}

			// Add temperature min/max
			if (this.config.showMinMaxTemperature) {
				svg.append("path")
					.attr("id", "min-max-temperature")
					.datum(sortedData.filter(d => (d.minTemperature !== null) && (d.maxTemperature !== null)))
					.attr("fill", this.config.fillColor)
					.attr("stroke", this.config.color)
					.attr("stroke-width", 1.5)
					.attr("d", d3.area().curve(d3.curveNatural)
						.x(d => xTime(d.date))
						.y0(d => yTemp(d.minTemperature))
						.y1(d => yTemp(d.maxTemperature))
					);
			}

			// Add temperature
			svg.append("path")
				.attr("id", "temperature")
				.datum(sortedData.filter(d => (d.temperature !== null)))
				.attr("fill", "none")
				.attr("stroke", this.config.color)
				.attr("stroke-width", 1.5)
				.attr("d", d3.line().curve(d3.curveNatural)
					.x(d => xTime(d.date))
					.y(d => yTemp(d.temperature))
				);

			// Add feels alike temperature
			if (this.config.showFeelsLikeTemp) {
				svg.append("path")
					.attr("id", "feelsLikeTemp")
					.datum(sortedData.filter(d => (d.feelsLikeTemp !== null)))
					.attr("fill", "none")
					.attr("stroke", this.config.color)
					.attr("stroke-width", 1.5)
					.attr("stroke-dasharray", "5, 5")
					.attr("d", d3.line().curve(d3.curveNatural)
						.x(d => xTime(d.date))
						.y(d => yTemp(d.feelsLikeTemp))
					);
			}

			// Add weather icons
			if (this.config.showIcons) {
				let lastIcon = undefined; // static
				function differentThanPrevious(d) {
					const res = lastIcon !== d.weatherType;
					lastIcon = d.weatherType;
					return res;
				}

				const dataIcons = sortedData.filter(differentThanPrevious) // Display only icons that are different from previous
				let lastPosNb = 1;
				let sumLastStack = 0;
				// Un-align icons if previous is too close
				function fctIconY(d, i) {
					let nb = 1;
					if (i > 0) {
						nb = (xTime(d.date) - xTime(dataIcons[i - 1].date)) / self.config.iconSize;
					}
					sumLastStack += nb * self.config.iconSize;
					if (nb < 1 && sumLastStack < self.config.iconSize) {
						return -self.config.iconSize + lastPosNb++ * self.config.iconSize / 1.5;
					} else {
						sumLastStack = 0;
						lastPosNb = 1;
						return -self.config.iconSize;
					}
				}

				svg.selectAll("grp")
					.append("g")
					.attr("class", "weather-icons")
					.data(dataIcons)
					.enter()
					.append("image") // Adding text with class wi weathericon does not work, so: using svg instead
					.attr("xlink:href", d => `${this.config.iconURLBase}/wi-${d.weatherType}.svg`)
					.attr("width", this.config.iconSize)
					.attr("x", d => xTime(d.date))
					.attr("y", fctIconY);
			}
		}

		// SVG is directly added into div module
		return document.createElement("div");
	},

	getStyles() {
		return [`${this.name}.css`];
	},

	getScripts: function () {
		// Load d3 from CDN
		return [
			"https://cdn.jsdelivr.net/npm/d3@" + this.config.d3jsVersion + "/dist/d3.min.js",
			"suncalc.js"
		];
	},
});
