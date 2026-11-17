import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI

/**
 Blocks the apps, categories and websites the user picked while a tree grows.

 Uses Apple's Screen Time APIs with individual authorization. The picker returns opaque
 tokens; Focus Garden never learns which apps were chosen. The shield is a named
 ManagedSettingsStore so stopping only clears Focus Garden's own restrictions.
 */
public class FocusShieldModule: Module {
  private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("focusgarden.shield"))
  private let selectionKey = ShieldSelection.key
  private let endsAtKey = "focusgarden.shield.endsAt.v1"

  private func loadSelection() -> FamilyActivitySelection {
    ShieldSelection.load()
  }

  private func saveSelection(_ selection: FamilyActivitySelection) {
    if let data = try? PropertyListEncoder().encode(selection) {
      UserDefaults.standard.set(data, forKey: selectionKey)
    }
  }

  private func count(_ selection: FamilyActivitySelection) -> Int {
    selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
  }

  /// False in builds made without the Family Controls entitlement (awaiting Apple approval).
  private var enabledInBuild: Bool {
    (Bundle.main.object(forInfoDictionaryKey: "FocusShieldEnabled") as? Bool) ?? true
  }

  /// The session schedule. When it ends, the FocusGardenActivity extension clears the shield,
  /// so blocking ends on time even if Focus Garden was closed during the session.
  private let activity = DeviceActivityName("focusgarden.session")

  private func clearShield() {
    DeviceActivityCenter().stopMonitoring([activity])
    store.clearAllSettings()
    UserDefaults.standard.removeObject(forKey: endsAtKey)
  }

  /// iOS requires a schedule of at least 15 minutes, so a shorter session's schedule starts in the
  /// past; only its end matters.
  private func monitorUntil(_ endsAt: Date) {
    let start = min(Date(), endsAt.addingTimeInterval(-15 * 60 - 5))
    let parts: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
    let schedule = DeviceActivitySchedule(
      intervalStart: Calendar.current.dateComponents(parts, from: start),
      intervalEnd: Calendar.current.dateComponents(parts, from: endsAt),
      repeats: false)
    let center = DeviceActivityCenter()
    center.stopMonitoring([activity])
    do {
      try center.startMonitoring(activity, during: schedule)
    } catch {
      // Without the schedule the shield still ends when the app next opens (see OnCreate).
    }
  }

  public func definition() -> ModuleDefinition {
    Name("FocusShield")

    OnCreate {
      guard self.enabledInBuild else { return }
      // A shield must never outlive its session, even if the app was closed during it.
      let endsAt = UserDefaults.standard.double(forKey: self.endsAtKey)
      if endsAt > 0 && endsAt <= Date().timeIntervalSince1970 * 1000 {
        self.clearShield()
      }
    }

    AsyncFunction("getStatus") { () -> [String: Any] in
      guard self.enabledInBuild else {
        return ["supported": false, "pendingApproval": true, "platform": "ios", "authorized": false, "selectionCount": 0, "active": false]
      }
      let endsAt = UserDefaults.standard.double(forKey: self.endsAtKey)
      return [
        "supported": true,
        "platform": "ios",
        "authorized": AuthorizationCenter.shared.authorizationStatus == .approved,
        "selectionCount": self.count(self.loadSelection()),
        "active": endsAt > Date().timeIntervalSince1970 * 1000,
      ]
    }

    AsyncFunction("requestAuthorization") { (promise: Promise) in
      guard self.enabledInBuild else { promise.resolve(false); return }
      Task {
        do {
          try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
          promise.resolve(AuthorizationCenter.shared.authorizationStatus == .approved)
        } catch {
          // Declining is a normal answer. Anything else (for example, a copy of the app signed
          // without the Family Controls entitlement) is reported so the app can explain it.
          if AuthorizationCenter.shared.authorizationStatus == .approved {
            promise.resolve(true)
          } else if let failure = error as? FamilyControlsError, failure == .authorizationCanceled {
            promise.resolve(false)
          } else {
            promise.reject("E_SCREEN_TIME", Self.describe(error))
          }
        }
      }
    }

    AsyncFunction("pickApps") { (promise: Promise) in
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("E_NO_VIEW", "Focus Garden is not ready to show the app picker.")
        return
      }
      var host: UIViewController?
      let view = ShieldPickerView(selection: self.loadSelection()) { picked in
        if let picked {
          self.saveSelection(picked)
        }
        host?.dismiss(animated: true)
        promise.resolve(self.count(self.loadSelection()))
      }
      let controller = UIHostingController(rootView: view)
      controller.isModalInPresentation = true
      host = controller
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    AsyncFunction("start") { (endsAt: Double) -> Bool in
      guard self.enabledInBuild else { return false }
      guard AuthorizationCenter.shared.authorizationStatus == .approved else { return false }
      let selection = self.loadSelection()
      guard self.count(selection) > 0, endsAt > Date().timeIntervalSince1970 * 1000 else { return false }
      self.store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
      self.store.shield.applicationCategories = selection.categoryTokens.isEmpty ? nil : .specific(selection.categoryTokens)
      self.store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
      UserDefaults.standard.set(endsAt, forKey: self.endsAtKey)
      self.monitorUntil(Date(timeIntervalSince1970: endsAt / 1000))
      return true
    }

    AsyncFunction("stop") {
      guard self.enabledInBuild else { return }
      self.clearShield()
    }

    /// The chosen apps, categories and websites, drawn with Apple's own labels. The tokens stay
    /// opaque: iOS draws each name and icon, and Focus Garden can't read them.
    View(FocusShieldSelectionView.self) {
      Prop("revision") { (view: FocusShieldSelectionView, _: Int) in
        view.reload()
      }
    }
  }

  static func describe(_ error: Error) -> String {
    let unsigned = "This copy of Focus Garden may be missing Apple's Family Controls permission."
    guard let failure = error as? FamilyControlsError else { return "\(error.localizedDescription) \(unsigned)" }
    switch failure {
    case .restricted: return "Screen Time is restricted on this iPhone (for example, by a parent or device management)."
    case .unavailable: return "Screen Time isn't available on this device."
    case .invalidAccountType: return "Screen Time needs an iCloud account signed in on this iPhone."
    case .invalidArgument: return "iOS refused the Screen Time request. \(unsigned)"
    case .authorizationConflict: return "Another app already manages Screen Time on this iPhone."
    case .networkError: return "iOS couldn't reach Apple to approve Screen Time. Check the connection and try again."
    case .authenticationMethodUnavailable: return "Set a device passcode, then try again."
    case .authorizationCanceled: return "Screen Time access was not allowed."
    @unknown default: return "iOS refused the Screen Time request. \(unsigned)"
    }
  }
}

/// Loads the picker selection shared by the module and its views.
enum ShieldSelection {
  static let key = "focusgarden.shield.selection.v1"
  static func load() -> FamilyActivitySelection {
    guard let data = UserDefaults.standard.data(forKey: key),
          let selection = try? PropertyListDecoder().decode(FamilyActivitySelection.self, from: data) else {
      return FamilyActivitySelection()
    }
    return selection
  }
}

final class FocusShieldSelectionView: ExpoView {
  private let host = UIHostingController(rootView: ShieldSelectionList(selection: ShieldSelection.load()))

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
    host.view.backgroundColor = .clear
    addSubview(host.view)
  }

  func reload() {
    host.rootView = ShieldSelectionList(selection: ShieldSelection.load())
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host.view.frame = bounds
  }
}

/// One 52 pt row per chosen item, separated by inset hairlines (the JS side sizes the view).
struct ShieldSelectionList: View {
  let selection: FamilyActivitySelection

  private enum Item: Hashable {
    case app(ApplicationToken), category(ActivityCategoryToken), site(WebDomainToken)
  }

  private var items: [Item] {
    selection.applicationTokens.map(Item.app)
      + selection.categoryTokens.map(Item.category)
      + selection.webDomainTokens.map(Item.site)
  }

  var body: some View {
    VStack(spacing: 0) {
      ForEach(Array(items.enumerated()), id: \.element) { index, item in
        if index > 0 { Divider().padding(.leading, 60) }
        Group {
          switch item {
          case .app(let token): Label(token)
          case .category(let token): Label(token)
          case .site(let token): Label(token)
          }
        }
        .labelStyle(ShieldRowLabelStyle())
        .frame(height: 52)
        .padding(.horizontal, 16)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
  }
}

struct ShieldRowLabelStyle: LabelStyle {
  func makeBody(configuration: Configuration) -> some View {
    HStack(spacing: 12) {
      configuration.icon.frame(width: 32, height: 32)
      configuration.title.font(.body).foregroundStyle(.primary).lineLimit(1)
      Spacer(minLength: 0)
    }
  }
}

struct ShieldPickerView: View {
  @State var selection: FamilyActivitySelection
  let onDone: (FamilyActivitySelection?) -> Void

  var body: some View {
    NavigationView {
      FamilyActivityPicker(selection: $selection)
        .navigationTitle("Apps to block")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
          ToolbarItem(placement: .cancellationAction) { Button("Cancel") { onDone(nil) } }
          ToolbarItem(placement: .confirmationAction) { Button("Done") { onDone(selection) } }
        }
    }
  }
}
