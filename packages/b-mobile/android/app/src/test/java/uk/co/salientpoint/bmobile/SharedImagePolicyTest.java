package uk.co.salientpoint.bmobile;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import org.junit.Test;

public class SharedImagePolicyTest {

  private static final String PKG = "uk.co.salientpoint.bmobile";

  @Test
  public void acceptsAnotherAppsContentUri() {
    assertTrue(SharedImagePolicy.isAcceptedSource("content", "com.google.android.apps.photos.contentprovider", PKG));
    assertTrue(SharedImagePolicy.isAcceptedSource("content", "media", PKG));
  }

  @Test
  public void rejectsFileScheme() {
    assertFalse(SharedImagePolicy.isAcceptedSource("file", "", PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource("file", null, PKG));
  }

  @Test
  public void rejectsOtherSchemes() {
    assertFalse(SharedImagePolicy.isAcceptedSource("https", "example.com", PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource(null, "media", PKG));
  }

  @Test
  public void rejectsOwnFileProviderAndOtherOwnAuthorities() {
    assertFalse(SharedImagePolicy.isAcceptedSource("content", PKG + ".fileprovider", PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource("CONTENT", PKG + ".fileprovider", PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource("content", PKG, PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource("content", "media;" + PKG + ".fileprovider", PKG));
  }

  @Test
  public void doesNotTreatALookalikePackageAsOwn() {
    assertTrue(SharedImagePolicy.isAcceptedSource("content", PKG + "evil.provider", PKG));
  }

  @Test
  public void rejectsMissingAuthority() {
    assertFalse(SharedImagePolicy.isAcceptedSource("content", "", PKG));
    assertFalse(SharedImagePolicy.isAcceptedSource("content", null, PKG));
  }

  @Test
  public void requiresPositiveDecodedBounds() {
    assertTrue(SharedImagePolicy.isDecodableImage(4000, 3000));
    assertFalse(SharedImagePolicy.isDecodableImage(-1, -1));
    assertFalse(SharedImagePolicy.isDecodableImage(0, 0));
    assertFalse(SharedImagePolicy.isDecodableImage(100, -1));
  }

  @Test
  public void copiesUpToTheCap() throws IOException {
    byte[] data = new byte[20_000];
    data[19_999] = 7;
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    assertEquals(20_000, SharedImagePolicy.copyCapped(new ByteArrayInputStream(data), out, 20_000));
    assertArrayEquals(data, out.toByteArray());
  }

  @Test
  public void throwsOnceTheCapIsExceeded() {
    ByteArrayOutputStream out = new ByteArrayOutputStream();
    try {
      SharedImagePolicy.copyCapped(new ByteArrayInputStream(new byte[20_001]), out, 20_000);
      fail("expected IOException");
    } catch (IOException expected) {
      assertTrue(out.size() <= 20_000);
    }
  }
}
