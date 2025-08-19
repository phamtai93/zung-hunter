export class URLParser {
  /**
   * Extract shopId and productId from URL
   * Pattern: https://abc.vn/product-name-i.{shopId}.{productId}
   */
  static parseProductUrl(url: string): { shopId?: string; productId?: string } {
    try {
      // Pattern: i.{shopId}.{productId} at the end of URL
      const regex = /i\.(\d+)\.(\d+)(?:\?.*)?$/;
      const match = url.match(regex);
      
      if (match) {
        return {
          shopId: match[1],
          productId: match[2]
        };
      }
      
      // Alternative patterns (add more as needed)
      const alternativePatterns = [
        // Pattern: /shop-{shopId}/product-{productId}
        /\/shop-(\d+)\/product-(\d+)/,
        // Pattern: ?shop=123&product=456
        /[?&]shop=(\d+).*?product=(\d+)|product=(\d+).*?shop=(\d+)/,
        // Add more patterns as needed
      ];
      
      for (const pattern of alternativePatterns) {
        const altMatch = url.match(pattern);
        if (altMatch) {
          return {
            shopId: altMatch[1] || altMatch[4],
            productId: altMatch[2] || altMatch[3]
          };
        }
      }
      
      return { shopId: undefined, productId: undefined };
      
    } catch (error) {
      console.warn('Error parsing URL:', error);
      return { shopId: undefined, productId: undefined };
    }
  }

  /**
   * Validate if URL is a supported product URL
   */
  static isProductUrl(url: string): boolean {
    const { shopId, productId } = this.parseProductUrl(url);
    return !!(shopId && productId);
  }


  /**
   * Get supported URL patterns for display
   */
  static getSupportedPatterns(): string[] {
    return [
      'https://domain.com/product-name-i.{shopId}.{productId}',
      'https://domain.com/shop-{shopId}/product-{productId}',
      'https://domain.com/product?shop={shopId}&product={productId}'
    ];
  }
}