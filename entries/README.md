# Gallery entries

The gallery shows the forecasts entrants email in, from the copies kept here. It never reads anyone's site.

To add an entry that opted in to the gallery:

1. Make a folder named after the nickname, e.g. `entries/the-last-neocon/`.
2. Put their file in it as `forecast.csv`, and `seat_sims.csv` if they sent one. Use the cleaned files from the course contest folder (`contest/forecasts/<group>/forecast_<id>.csv` and `seat_sims_<id>.csv`).
3. Add a row to `gallery.csv`: `nickname,site address (optional),entries/<folder>/,outlier,asof`.
   - `outlier`: leave blank, or put `y` if the contest session flags the entry under the outlier rule (K = 4). An outlier stays listed everywhere but is left out of the contest average.
   - `asof`: the date the forecast was received, as YYYY-MM-DD (the "As of" column on the page). **When an entrant sends an updated forecast, replace its files and update this date.**

Nicknames only: no real names in folder names, files or `gallery.csv`. To update an entry, replace its files and its `asof` date.
