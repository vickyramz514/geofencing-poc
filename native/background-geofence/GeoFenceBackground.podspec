Pod::Spec.new do |s|
  s.name         = "GeoFenceBackground"
  s.version      = "0.1.0"
  s.summary      = "Core Location region monitoring for GeoFencePOC"
  s.homepage     = "https://github.com/geofencepoc/background"
  s.license      = "MIT"
  s.author       = "GeoFencePOC"
  s.platforms    = { :ios => "15.1" }
  s.source       = { :path => "." }
  s.source_files = "ios/**/*.{h,m,mm}"
  s.frameworks   = "CoreLocation", "UserNotifications"

  if defined?(install_modules_dependencies()) != nil
    install_modules_dependencies(s)
  else
    s.dependency "React-Core"
  end
end
