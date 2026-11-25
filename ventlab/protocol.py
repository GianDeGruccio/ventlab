"""Phase 1 working assumptions, set independently of reference airflow."""

VOLUME_M3 = 2.69 * 2.71 * 3.0
FILES = {
    "training_data_1.csv": "development",
    "training_data_2.csv": "development",
    "ventilation_test.csv": "evaluation",
}
TIME = "time"
ROOM = "Room CO2 (ppm)"
SUPPLY = "Supply air CO2 (ppm)"
OCC = "Occupant count"
FLOW = "Supply airflow (l/s)"
EXTRACT = "Extract airflow (l/s)"
ML = "Occupant count (ML estimate)"
EXHAUST = "Exhaust air CO2 (ppm)"
UNITS = {TIME: "local clock as recorded (zone unspecified)", ROOM: "ppm",
         "Temperature (°C)": "°C", "Relative Humidity (%)": "%", "Pressure (mbar)": "mbar",
         FLOW: "L/s", EXTRACT: "L/s", SUPPLY: "ppm", EXHAUST: "ppm",
         ML: "persons (estimate)", OCC: "persons"}
CADENCE_S = 60
MAX_RATE = 30.0  # numerical search limit, h^-1
MIN_FIT_MIN = 10.0
SHORT_MIN = 20.0
ROOM_ACCURACY = 30.0
BACKGROUND = 420.0
ASSUMED_BG_SHIFT = 50.0
NEAR_ZERO_LPS = 1.0
