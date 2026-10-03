# MX10 direct-print correction

The supplied Fun Print APK was inspected locally, without running the application.
Its bundled JavaScript and native V5G driver confirm several differences from the
previous web driver that can explain faint or incomplete prints. Physical output
still needs to be compared on the user's MX10 and continuous sticker roll.

## APK evidence

- Input: `C:/Users/jhonr/Documents/fun print.apk`.
- SHA-256: `47e5b1df1eadbf98aea5817b012138d17dc4594ea1d54e738f390db1896b5064`.
- Bundled source: `assets/apps/__UNI__573AE67/www/pages/print_preview/print_webview_preview.js`.
- Module 28's `crc8()` returns the original payload **and** its checksum. The old
  web F2 command declared a two-byte payload but transmitted only the checksum.
  The corrected Dark packet is `51 78 F2 00 02 00 01 C8 63 FF`.
- Modules 130 and 150 map MX10 to the MX06 image-density presets, with a maximum
  density of 200. Module 561 supplies the corresponding energy and quality values.
- Native `com.xyz.yintibao.library.V5g.getEnerageByte()` writes energy low byte
  first. Its image path selects BE payload `00` and fixed-width A2 bitmap rows.
  The old web driver used reversed energy bytes, text mode, and mixed compressed
  rows. `V5gCMD.paper` also confirms that the feed distance is low byte first.

| Graphics preset | Density | Energy | Quality payload |
| --- | ---: | ---: | --- |
| Light (75%) | 150 | 10000 | `33` |
| Medium (90%) | 180 | 10000 | `34` |
| Dark (100%) | 200 | 15000 | `34` |

The web defaults to Dark. These are the APK's MX10 Graphics presets; physical
darkness also depends on the roll, battery, printer temperature and firmware.

## Raster and paper behavior

The driver generates a 384 × 240-dot monochrome image: 30 mm of paper at 8 dots/mm,
with approximately 48 mm of printable width. Every QR module occupies an equal,
whole number of printer dots, with a four-module white border. A typical 33-module
equipment QR uses five dots per module. PNG download uses the same raster.

Continuous sticker is the default. It now advances 2 mm before the first raster
row (A1 payload `10 00`, 16 dots), sends the complete 30 mm raster, then adds a
3 mm tear allowance (A1 payload `18 00`, 24 dots): 35 mm total by default. Start
allowance is adjustable from 0 to 5 mm; tear allowance from 0 to 10 mm, both in
half-millimeter steps. The added start feed responds to the user's photo of
incomplete top rows and still requires a physical test. It is not a newly
discovered APK preset. Gap calibration remains hidden for continuous stock.
Precut stock does not receive the start feed and retains sensor positioning.
Saved allowances also determine printable-sheet spacing.

The artwork starts at the top of its QR box, preserving the complete four-module
quiet zone while removing spare leading whitespace. A small monochrome vector
trace of the existing logo's stencil wordmark replaces the brand text under the
equipment name. It omits the shaded background and small illustrations for
legibility on the thermal printhead, and is embedded directly into preview,
downloaded PNG and printed-sheet SVGs.

The logo is horizontally centered under the equipment code/name's 185-unit text
column. QR offsets are bounded against the complete QR box before preview, PNG
and direct printing. An older negative vertical offset is corrected to zero
instead of clipping the top rows or white border. Artwork remains 384 × 240 dots;
the start/tear feed commands apply outside that image.

Raster writes await each Bluetooth operation and use AE buffer notifications
without a fixed sleep after every packet. This removes the previous 20 ms-per-
packet throttle that could starve the printer's raster buffer. Devices without
notifications retain a conservative 7 ms delay. Print speed and the confirmed
image-darkness presets remain the same. Smoothness needs a physical printer
comparison; thermal protection may still pause the hardware.

AE notifications pause and resume data transfer; they do not signal print
completion. The web waits a bounded finishing interval and stops transferring on
paper-out or overheat status. Physical completion is not acknowledged by this
timer.

## Verification and printer comparison

All 32 web tests, JavaScript syntax checks and the static-site build passed.
Printer checks cover packet boundaries/checksums, image presets, bitmap dot
order, QR module geometry, continuous and precut jobs, pause/resume, paper-out,
overheat, recovery after reloading/cooling, ordered streaming, fallback pacing
and concurrent-print prevention. Development and production checks follow all
browser imports to catch missing modules. A browser check decodes the generated
384 × 240 black-and-white QR back to its original equipment token, including a
saved -5 mm vertical offset that previously could clip the QR. Phone preview
checks cover controls, saved preferences and fitting the complete label onscreen.

After deployment, use Android Chrome, select **Continuous · no gaps** and
**Dark · 100%**, then print one label on the same roll used for the Fun Print
comparison, starting with a 2 mm start allowance and 3 mm tear allowance. The user confirmed the prior
quality correction was clear on paper; the new placement, allowance and streaming
changes still require a physical test. Scan and tear off the paper QR, then print
again. Adjust the allowance if more clearance is needed. The fixed distance
between the printhead and tear edge also affects the physical leading margin;
the driver does not attempt unverified reverse-paper commands.
