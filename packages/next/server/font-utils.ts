import * as Log from '../build/output/log'
import {
  GOOGLE_FONT_PROVIDER,
  DEFAULT_SERIF_FONT,
  DEFAULT_SANS_SERIF_FONT,
} from '../shared/lib/constants'
const googleFontsMetrics = require('./google-font-metrics.json')
const https = require('https')

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36'
const IE_UA = 'Mozilla/5.0 (Windows NT 10.0; Trident/7.0; rv:11.0) like Gecko'

export type FontManifest = Array<{
  url: string
  content: string
}>

export type FontConfig = boolean

function isGoogleFont(url: string): boolean {
  return url.startsWith(GOOGLE_FONT_PROVIDER)
}

function getFontForUA(url: string, UA: string): Promise<String> {
  return new Promise((resolve, reject) => {
    let rawData: any = ''
    https
      .get(
        url,
        {
          headers: {
            'user-agent': UA,
          },
        },
        (res: any) => {
          res.on('data', (chunk: any) => {
            rawData += chunk
          })
          res.on('end', () => {
            resolve(rawData.toString('utf8'))
          })
        }
      )
      .on('error', (e: Error) => {
        reject(e)
      })
  })
}

export async function getFontDefinitionFromNetwork(
  url: string
): Promise<string> {
  let result = ''
  /**
   * The order of IE -> Chrome is important, other wise chrome starts loading woff1.
   * CSS cascading 🤷‍♂️.
   */
  try {
    if (isGoogleFont(url)) {
      result += await getFontForUA(url, IE_UA)
    }
    result += await getFontForUA(url, CHROME_UA)
  } catch (e) {
    Log.warn(
      `Failed to download the stylesheet for ${url}. Skipped optimizing this font.`
    )
    return ''
  }

  return result
}

export function getFontDefinitionFromManifest(
  url: string,
  manifest: FontManifest
): string {
  return (
    manifest.find((font) => {
      if (font && font.url === url) {
        return true
      }
      return false
    })?.content || ''
  )
}

function parseGoogleFontName(css: string): Array<string> {
  const regex = /font-family: ([^;]*)/g
  const matches = css.matchAll(regex)
  const fontNames = new Set<string>()

  for (let font of matches) {
    const fontFamily = font[1].replace(/^['"]|['"]$/g, '')
    fontNames.add(fontFamily)
  }

  return [...fontNames]
}

export function calculateOverrideValues(font: string, fontMetrics: any) {
  const fontKey = font.toLowerCase().trim().replace(/ /g, '')
  const { category, ascentOverride, descentOverride, lineGapOverride } =
    fontMetrics[fontKey]
  const fallbackFont =
    category === 'serif' ? DEFAULT_SERIF_FONT : DEFAULT_SANS_SERIF_FONT
  const ascent = (ascentOverride * 100).toFixed(2)
  const descent = (descentOverride * 100).toFixed(2)
  const lineGap = (lineGapOverride * 100).toFixed(2)

  return {
    ascent,
    descent,
    lineGap,
    fallbackFont,
  }
}

function calculateOverrideCSS(font: string, fontMetrics: any) {
  const fontName = font.toLowerCase().trim().replace(/ /g, '-')

  const { ascent, descent, lineGap, fallbackFont } = calculateOverrideValues(
    font,
    fontMetrics
  )

  return `
    @font-face {
      font-family: "${fontName}-fallback";
      ascent-override: ${ascent}%;
      descent-override: ${descent}%;
      line-gap-override: ${lineGap}%;
      src: local("${fallbackFont}");
    }
  `
}

export function getFontOverrideCss(url: string, css: string) {
  if (!isGoogleFont(url)) {
    return ''
  }

  try {
    const fontNames = parseGoogleFontName(css)
    const fontMetrics = googleFontsMetrics

    const fontCss = fontNames.reduce((cssStr, fontName) => {
      cssStr += calculateOverrideCSS(fontName, fontMetrics)
      return cssStr
    }, '')

    return fontCss
  } catch (e) {
    console.log('Error getting font override values - ', e)
    return ''
  }
}
