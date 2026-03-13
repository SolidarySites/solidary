import { useEffect } from "react"
import {
  clearExternalImageTracking,
  EXTERNAL_IMAGE_SKIP_ATTR,
  getTrackedExternalImageSource,
  isExternalImageSource,
  startExternalImageLoadWithPlaceholder
} from "../lib/external-image-loading"

const forEachImageInNode = (node: Node, visit: (image: HTMLImageElement) => void) => {
  if (node instanceof HTMLImageElement) {
    visit(node)
  }

  if (!(node instanceof Element)) return
  node.querySelectorAll("img").forEach((image) => visit(image))
}

export const useGlobalExternalImageLoading = () => {
  useEffect(() => {
    const trackedImages = new Map<
      HTMLImageElement,
      {
        source: string
        cleanup: () => void
      }
    >()

    const stopTracking = (image: HTMLImageElement, clearAttributes: boolean) => {
      const tracked = trackedImages.get(image)
      if (tracked) {
        tracked.cleanup()
        trackedImages.delete(image)
      }

      if (clearAttributes) {
        clearExternalImageTracking(image)
      }
    }

    const processImage = (image: HTMLImageElement) => {
      if (image.hasAttribute(EXTERNAL_IMAGE_SKIP_ATTR)) {
        stopTracking(image, true)
        return
      }

      const source = getTrackedExternalImageSource(image)
      if (!isExternalImageSource(source)) {
        stopTracking(image, true)
        return
      }

      const tracked = trackedImages.get(image)
      if (tracked?.source === source) return

      stopTracking(image, false)
      trackedImages.set(image, {
        source,
        cleanup: startExternalImageLoadWithPlaceholder(image, source)
      })
    }

    document.querySelectorAll("img").forEach((image) => processImage(image))

    const observer = new MutationObserver((records) => {
      records.forEach((record) => {
        if (record.type === "attributes" && record.target instanceof HTMLImageElement) {
          processImage(record.target)
          return
        }

        if (record.type !== "childList") return

        record.addedNodes.forEach((node) => {
          forEachImageInNode(node, processImage)
        })

        record.removedNodes.forEach((node) => {
          forEachImageInNode(node, (image) => stopTracking(image, false))
        })
      })
    })

    if (document.body) {
      observer.observe(document.body, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["src", "data-external-image-src", EXTERNAL_IMAGE_SKIP_ATTR]
      })
    }

    return () => {
      observer.disconnect()
      trackedImages.forEach((tracked, image) => {
        tracked.cleanup()
        clearExternalImageTracking(image)
      })
      trackedImages.clear()
    }
  }, [])
}
